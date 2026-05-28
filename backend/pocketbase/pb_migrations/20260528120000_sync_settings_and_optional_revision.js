migrate((app) => {
  const authRule = "user = @request.auth.id";
  const users = app.findCollectionByNameOrId("users");

  // Make client_revision optional (no longer used by the client).
  const profiles = app.findCollectionByNameOrId("profiles");
  const rev = profiles.fields.getByName("client_revision");
  if (rev) {
    rev.required = false;
    app.save(profiles);
  }

  // New settings collection: one encrypted singleton record per user.
  let settings;
  try {
    settings = app.findCollectionByNameOrId("settings");
  } catch {
    settings = new Collection({ type: "base", name: "settings" });
  }

  const addFieldIfMissing = (collection, field) => {
    if (!collection.fields.getByName(field.name)) collection.fields.add(field);
  };

  addFieldIfMissing(settings, new RelationField({
    name: "user", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true,
  }));
  addFieldIfMissing(settings, new TextField({ name: "blob", required: true }));
  addFieldIfMissing(settings, new TextField({ name: "nonce", required: true, max: 128 }));
  addFieldIfMissing(settings, new NumberField({ name: "schema_version", required: true }));

  settings.listRule = authRule;
  settings.viewRule = authRule;
  settings.createRule = authRule;
  settings.updateRule = authRule;
  settings.deleteRule = authRule;

  const hasIndex = settings.indexes.some((i) => i.includes(" idx_settings_user "));
  if (!hasIndex) settings.addIndex("idx_settings_user", true, "user", "");

  app.save(settings);
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("settings"));
  } catch {
    // not present
  }
  const profiles = app.findCollectionByNameOrId("profiles");
  const rev = profiles.fields.getByName("client_revision");
  if (rev) {
    rev.required = true;
    app.save(profiles);
  }
});
