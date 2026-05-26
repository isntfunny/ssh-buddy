package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestPolicyHelpers(t *testing.T) {
	if !matchPattern("example.com", "example.com") {
		t.Fatal("expected exact host match")
	}
	if !matchPattern("app.example.com", "*.example.com") {
		t.Fatal("expected wildcard domain match")
	}
	if !matchPattern("192.168.1.10", "192.168.1.0/24") {
		t.Fatal("expected cidr match")
	}
	if matchPattern("192.168.2.10", "192.168.1.0/24") {
		t.Fatal("did not expect cidr match")
	}
}

func TestOriginPolicyRejectsUnknownOrigin(t *testing.T) {
	srv := newServer(testConfig())
	httpServer := httptest.NewServer(srv.routes())
	defer httpServer.Close()

	wsURL := websocketURL(httpServer.URL)
	headers := http.Header{}
	headers.Set("Origin", "http://evil.example")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err == nil {
		_ = conn.Close()
		t.Fatal("expected origin rejection")
	}
}

func TestProxyIntegrationConnectAndRunCommand(t *testing.T) {
	if os.Getenv("SSH_BUDDY_PROXY_INTEGRATION") == "" {
		t.Skip("set SSH_BUDDY_PROXY_INTEGRATION=1 and run docker-compose.test.yml to enable")
	}

	cfg := testConfig()
	cfg.allowedTargets = []string{envString("SSH_BUDDY_TEST_HOST", "127.0.0.1")}
	srv := newServer(cfg)
	httpServer := httptest.NewServer(srv.routes())
	defer httpServer.Close()

	headers := http.Header{}
	headers.Set("Origin", "http://localhost:1420")
	conn, _, err := websocket.DefaultDialer.Dial(websocketURL(httpServer.URL), headers)
	if err != nil {
		t.Fatalf("dial proxy websocket: %v", err)
	}
	defer conn.Close()

	req := connectRequest{
		Host:        envString("SSH_BUDDY_TEST_HOST", "127.0.0.1"),
		Port:        uint16(testEnvInt("SSH_BUDDY_TEST_PORT", 2222)),
		Username:    envString("SSH_BUDDY_TEST_USER", "testuser"),
		Auth:        wireAuth{Kind: "password", Password: envString("SSH_BUDDY_TEST_PASSWORD", "testpass")},
		InitialCols: 80,
		InitialRows: 24,
	}
	if err := conn.WriteJSON(clientMessage{Type: "connect", Request: &req}); err != nil {
		t.Fatalf("send connect: %v", err)
	}

	var connected serverMessage
	if err := conn.ReadJSON(&connected); err != nil {
		t.Fatalf("read connected: %v", err)
	}
	if connected.Type != "connected" {
		t.Fatalf("expected connected, got %+v", connected)
	}

	if err := conn.WriteMessage(websocket.BinaryMessage, []byte("echo hello-proxy && exit\n")); err != nil {
		t.Fatalf("send command: %v", err)
	}

	deadline := time.Now().Add(5 * time.Second)
	var output strings.Builder
	for time.Now().Before(deadline) {
		_ = conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
		msgType, payload, err := conn.ReadMessage()
		if err != nil {
			continue
		}
		if msgType == websocket.BinaryMessage {
			output.Write(payload)
			if strings.Contains(output.String(), "hello-proxy") {
				return
			}
		}
		if msgType == websocket.TextMessage {
			var message serverMessage
			if err := json.Unmarshal(payload, &message); err == nil && message.Type == "error" {
				t.Fatalf("proxy error: %s", message.Message)
			}
		}
	}
	t.Fatalf("did not see command output, got %q", output.String())
}

func testConfig() proxyConfig {
	return proxyConfig{
		listenAddr:       ":0",
		writeTimeout:     time.Second,
		dialTimeout:      5 * time.Second,
		idleTimeout:      10 * time.Second,
		maxSessionTime:   time.Minute,
		maxInitBytes:     64 * 1024,
		allowedOrigins:   []string{"http://localhost:1420"},
		maxSessionsPerIP: 2,
	}
}

func websocketURL(httpURL string) string {
	parsed, err := url.Parse(httpURL)
	if err != nil {
		panic(err)
	}
	parsed.Scheme = "ws"
	parsed.Path = "/ssh"
	return parsed.String()
}

func testEnvInt(name string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}
