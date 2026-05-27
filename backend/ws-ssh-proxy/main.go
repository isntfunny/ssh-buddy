package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

const (
	defaultListenAddr      = ":8080"
	defaultWriteTimeout    = 10 * time.Second
	defaultDialTimeout     = 10 * time.Second
	defaultIdleTimeout     = 5 * time.Minute
	defaultSessionDuration = 2 * time.Hour
	defaultMaxInitBytes    = 64 * 1024
	defaultMaxPerIP        = 10
)

type proxyConfig struct {
	listenAddr       string
	webDir           string
	writeTimeout     time.Duration
	dialTimeout      time.Duration
	idleTimeout      time.Duration
	maxSessionTime   time.Duration
	maxInitBytes     int64
	allowedOrigins   []string
	allowedTargets   []string
	deniedTargets    []string
	maxSessionsPerIP int
}

type server struct {
	config   proxyConfig
	sessions *ipSessionLimiter
	upgrader websocket.Upgrader
}

type ipSessionLimiter struct {
	mu     sync.Mutex
	counts map[string]int
}

type clientMessage struct {
	Type string `json:"type"`

	Request *connectRequest `json:"request,omitempty"`
	Cols    uint32          `json:"cols,omitempty"`
	Rows    uint32          `json:"rows,omitempty"`
}

type connectRequest struct {
	Host        string   `json:"host"`
	Port        uint16   `json:"port"`
	Username    string   `json:"username"`
	Auth        wireAuth `json:"auth"`
	InitialCols uint32   `json:"initialCols"`
	InitialRows uint32   `json:"initialRows"`
}

type wireAuth struct {
	Kind       string `json:"kind"`
	Password   string `json:"password,omitempty"`
	PEM        string `json:"pem,omitempty"`
	Passphrase string `json:"passphrase,omitempty"`
}

type serverMessage struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId,omitempty"`
	Message   string `json:"message,omitempty"`
}

type safeConn struct {
	conn         *websocket.Conn
	writeTimeout time.Duration
	mu           sync.Mutex
}

func (c *safeConn) writeJSON(v serverMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(c.writeTimeout))
	return c.conn.WriteJSON(v)
}

func (c *safeConn) writeBinary(payload []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(c.writeTimeout))
	return c.conn.WriteMessage(websocket.BinaryMessage, payload)
}

func main() {
	cfg := configFromEnv()
	srv := newServer(cfg)

	log.Printf("ws-ssh-proxy listening on %s", cfg.listenAddr)
	if err := http.ListenAndServe(cfg.listenAddr, srv.routes()); err != nil {
		log.Fatal(err)
	}
}

func newServer(cfg proxyConfig) *server {
	srv := &server{
		config:   cfg,
		sessions: &ipSessionLimiter{counts: make(map[string]int)},
	}
	srv.upgrader = websocket.Upgrader{
		CheckOrigin: srv.checkOrigin,
	}
	return srv
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/ssh", s.handleSSH)
	if s.config.webDir != "" {
		mux.HandleFunc("/", s.handleWeb)
	}
	return mux
}

func (s *server) handleWeb(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cleanPath := filepath.Clean("/" + strings.TrimPrefix(r.URL.Path, "/"))
	if cleanPath == "/" {
		cleanPath = "/index.html"
	}

	fullPath := filepath.Join(s.config.webDir, strings.TrimPrefix(cleanPath, "/"))
	if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
		http.ServeFile(w, r, fullPath)
		return
	}

	http.ServeFile(w, r, filepath.Join(s.config.webDir, "index.html"))
}

func (s *server) handleSSH(w http.ResponseWriter, r *http.Request) {
	remoteIP := clientIP(r)
	if !s.sessions.acquire(remoteIP, s.config.maxSessionsPerIP) {
		http.Error(w, "too many active sessions", http.StatusTooManyRequests)
		return
	}
	defer s.sessions.release(remoteIP)

	ws, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer ws.Close()
	ws.SetReadLimit(s.config.maxInitBytes)

	msgType, payload, err := s.readMessage(ws)
	if err != nil {
		return
	}
	if msgType != websocket.TextMessage {
		_ = s.safe(ws).writeJSON(serverMessage{Type: "error", Message: "first message must be a connect request"})
		return
	}

	var init clientMessage
	if err := json.Unmarshal(payload, &init); err != nil || init.Type != "connect" || init.Request == nil {
		_ = s.safe(ws).writeJSON(serverMessage{Type: "error", Message: "invalid connect request"})
		return
	}
	if err := s.validateConnectRequest(*init.Request); err != nil {
		_ = s.safe(ws).writeJSON(serverMessage{Type: "error", Message: err.Error()})
		return
	}

	started := time.Now()
	target := net.JoinHostPort(init.Request.Host, strconv.Itoa(int(init.Request.Port)))
	log.Printf(
		"event=ssh_connect_start target=%s user=%s auth=%s remote_ip=%s",
		target,
		init.Request.Username,
		init.Request.Auth.Kind,
		remoteIP,
	)

	client, session, stdin, err := s.openSSHSession(*init.Request)
	if err != nil {
		log.Printf(
			"event=ssh_connect_failed target=%s remote_ip=%s duration_ms=%d error=%q",
			target,
			remoteIP,
			time.Since(started).Milliseconds(),
			sanitizeError(err),
		)
		_ = s.safe(ws).writeJSON(serverMessage{Type: "error", Message: friendlyError(err)})
		return
	}
	defer client.Close()
	defer session.Close()

	safe := s.safe(ws)
	sessionID := fmt.Sprintf("%d", time.Now().UnixNano())
	if err := safe.writeJSON(serverMessage{Type: "connected", SessionID: sessionID}); err != nil {
		return
	}

	var bytesToClient int64
	var bytesToServer int64
	done := make(chan struct{})
	closeOnce := sync.Once{}
	closeDone := func() {
		closeOnce.Do(func() { close(done) })
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		_ = safe.writeJSON(serverMessage{Type: "error", Message: "failed to open stdout pipe"})
		return
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		_ = safe.writeJSON(serverMessage{Type: "error", Message: "failed to open stderr pipe"})
		return
	}

	if err := session.Shell(); err != nil {
		_ = safe.writeJSON(serverMessage{Type: "error", Message: friendlyError(err)})
		return
	}

	go pumpReader(stdout, safe, &bytesToClient, closeDone)
	go pumpReader(stderr, safe, &bytesToClient, closeDone)

	sessionTimer := time.NewTimer(s.config.maxSessionTime)
	defer sessionTimer.Stop()

	for {
		select {
		case <-done:
			s.logClosed(target, remoteIP, started, bytesToClient, bytesToServer)
			_ = safe.writeJSON(serverMessage{Type: "closed"})
			return
		case <-sessionTimer.C:
			log.Printf("event=ssh_session_limit target=%s remote_ip=%s", target, remoteIP)
			_ = safe.writeJSON(serverMessage{Type: "error", Message: "session time limit reached"})
			return
		default:
		}

		msgType, payload, err := s.readMessage(ws)
		if err != nil {
			s.logClosed(target, remoteIP, started, bytesToClient, bytesToServer)
			return
		}

		switch msgType {
		case websocket.BinaryMessage:
			n, err := stdin.Write(payload)
			atomic.AddInt64(&bytesToServer, int64(n))
			if err != nil {
				closeDone()
			}
		case websocket.TextMessage:
			var message clientMessage
			if err := json.Unmarshal(payload, &message); err != nil {
				continue
			}
			switch message.Type {
			case "resize":
				_ = session.WindowChange(int(message.Rows), int(message.Cols))
			case "disconnect":
				closeDone()
			}
		}
	}
}

func (s *server) safe(ws *websocket.Conn) *safeConn {
	return &safeConn{conn: ws, writeTimeout: s.config.writeTimeout}
}

func (s *server) readMessage(ws *websocket.Conn) (int, []byte, error) {
	_ = ws.SetReadDeadline(time.Now().Add(s.config.idleTimeout))
	return ws.ReadMessage()
}

func (s *server) checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	return matchesList(origin, s.config.allowedOrigins)
}

func (s *server) validateConnectRequest(req connectRequest) error {
	if req.Host == "" {
		return errors.New("host is required")
	}
	if req.Port == 0 {
		return errors.New("port is required")
	}
	if req.Username == "" {
		return errors.New("username is required")
	}
	if matchesList(req.Host, s.config.deniedTargets) {
		return errors.New("target host is denied by proxy policy")
	}
	if len(s.config.allowedTargets) > 0 && !matchesList(req.Host, s.config.allowedTargets) {
		return errors.New("target host is not allowed by proxy policy")
	}
	return nil
}

func (s *server) openSSHSession(req connectRequest) (*ssh.Client, *ssh.Session, io.WriteCloser, error) {
	auth, err := authMethods(req.Auth)
	if err != nil {
		return nil, nil, nil, err
	}

	config := &ssh.ClientConfig{
		User:            req.Username,
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         s.config.dialTimeout,
	}

	target := net.JoinHostPort(req.Host, strconv.Itoa(int(req.Port)))
	conn, err := net.DialTimeout("tcp", target, s.config.dialTimeout)
	if err != nil {
		return nil, nil, nil, err
	}

	sshConn, chans, reqs, err := ssh.NewClientConn(conn, target, config)
	if err != nil {
		_ = conn.Close()
		return nil, nil, nil, err
	}
	client := ssh.NewClient(sshConn, chans, reqs)

	session, err := client.NewSession()
	if err != nil {
		_ = client.Close()
		return nil, nil, nil, err
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		_ = session.Close()
		_ = client.Close()
		return nil, nil, nil, err
	}

	cols := req.InitialCols
	if cols == 0 {
		cols = 80
	}
	rows := req.InitialRows
	if rows == 0 {
		rows = 24
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", int(rows), int(cols), modes); err != nil {
		_ = session.Close()
		_ = client.Close()
		return nil, nil, nil, err
	}

	return client, session, stdin, nil
}

func (s *server) logClosed(target string, remoteIP string, started time.Time, bytesToClient int64, bytesToServer int64) {
	log.Printf(
		"event=ssh_connect_closed target=%s remote_ip=%s duration_ms=%d bytes_to_client=%d bytes_to_server=%d",
		target,
		remoteIP,
		time.Since(started).Milliseconds(),
		atomic.LoadInt64(&bytesToClient),
		atomic.LoadInt64(&bytesToServer),
	)
}

func authMethods(auth wireAuth) ([]ssh.AuthMethod, error) {
	switch auth.Kind {
	case "password":
		if auth.Password == "" {
			return nil, errors.New("password is required")
		}
		return []ssh.AuthMethod{ssh.Password(auth.Password)}, nil
	case "privateKey":
		if auth.PEM == "" {
			return nil, errors.New("private key is required")
		}
		var signer ssh.Signer
		var err error
		if auth.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(auth.PEM), []byte(auth.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(auth.PEM))
		}
		if err != nil {
			return nil, fmt.Errorf("key parse error: %w", err)
		}
		return []ssh.AuthMethod{ssh.PublicKeys(signer)}, nil
	default:
		return nil, fmt.Errorf("unsupported auth method: %s", auth.Kind)
	}
}

func pumpReader(reader io.Reader, ws *safeConn, count *int64, closeDone func()) {
	buf := make([]byte, 32*1024)
	for {
		n, err := reader.Read(buf)
		if n > 0 {
			atomic.AddInt64(count, int64(n))
			if writeErr := ws.writeBinary(buf[:n]); writeErr != nil {
				closeDone()
				return
			}
		}
		if err != nil {
			closeDone()
			return
		}
	}
}

func friendlyError(err error) string {
	msg := err.Error()
	if errors.Is(err, os.ErrDeadlineExceeded) {
		return "Connection timed out - is the SSH server reachable on that host:port?"
	}
	if strings.Contains(msg, "unable to authenticate") {
		return "Authentication failed - check the username, password, or key."
	}
	return sanitizeError(err)
}

func sanitizeError(err error) string {
	msg := err.Error()
	if len(msg) > 300 {
		return msg[:300]
	}
	return msg
}

func configFromEnv() proxyConfig {
	return proxyConfig{
		listenAddr:       envString("SSH_BUDDY_PROXY_ADDR", defaultListenAddr),
		webDir:           envString("SSH_BUDDY_WEB_DIR", ""),
		writeTimeout:     envDuration("SSH_BUDDY_PROXY_WRITE_TIMEOUT", defaultWriteTimeout),
		dialTimeout:      envDuration("SSH_BUDDY_PROXY_DIAL_TIMEOUT", defaultDialTimeout),
		idleTimeout:      envDuration("SSH_BUDDY_PROXY_IDLE_TIMEOUT", defaultIdleTimeout),
		maxSessionTime:   envDuration("SSH_BUDDY_PROXY_MAX_SESSION_TIME", defaultSessionDuration),
		maxInitBytes:     int64(envInt("SSH_BUDDY_PROXY_MAX_INIT_BYTES", defaultMaxInitBytes)),
		allowedOrigins:   envList("SSH_BUDDY_PROXY_ALLOWED_ORIGINS", "http://localhost:1420,http://127.0.0.1:1420"),
		allowedTargets:   envList("SSH_BUDDY_PROXY_ALLOWED_TARGETS", ""),
		deniedTargets:    envList("SSH_BUDDY_PROXY_DENIED_TARGETS", ""),
		maxSessionsPerIP: envInt("SSH_BUDDY_PROXY_MAX_SESSIONS_PER_IP", defaultMaxPerIP),
	}
}

func envString(name string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func envDuration(name string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		log.Printf("invalid duration %s=%q, using %s", name, value, fallback)
		return fallback
	}
	return parsed
}

func envInt(name string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		log.Printf("invalid integer %s=%q, using %d", name, value, fallback)
		return fallback
	}
	return parsed
}

func envList(name string, fallback string) []string {
	value := os.Getenv(name)
	if strings.TrimSpace(value) == "" {
		value = fallback
	}
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func matchesList(value string, patterns []string) bool {
	for _, pattern := range patterns {
		if matchPattern(value, pattern) {
			return true
		}
	}
	return false
}

func matchPattern(value string, pattern string) bool {
	if pattern == "*" || strings.EqualFold(value, pattern) {
		return true
	}
	if strings.HasPrefix(pattern, "*.") {
		return strings.HasSuffix(strings.ToLower(value), strings.ToLower(strings.TrimPrefix(pattern, "*")))
	}
	if _, network, err := net.ParseCIDR(pattern); err == nil {
		ip := net.ParseIP(value)
		return ip != nil && network.Contains(ip)
	}
	return false
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (l *ipSessionLimiter) acquire(ip string, max int) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.counts[ip] >= max {
		return false
	}
	l.counts[ip]++
	return true
}

func (l *ipSessionLimiter) release(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.counts[ip]--
	if l.counts[ip] <= 0 {
		delete(l.counts, ip)
	}
}
