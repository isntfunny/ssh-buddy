migrate((app) => {
  const authRule = "user = @request.auth.id";
  const users = app.findCollectionByNameOrId("users");

  const addFieldIfMissing = (collection, field) => {
    if (!collection.fields.getByName(field.name)) {
      collection.fields.add(field);
    }
  };

  const addIndexIfMissing = (collection, name, unique, columns, where) => {
    const exists = collection.indexes.some((index) => index.includes(` ${name} `));
    if (!exists) {
      collection.addIndex(name, unique, columns, where);
    }
  };

  addFieldIfMissing(users, new TextField({
    name: "kdf_salt",
    required: false,
    max: 512,
  }));
  if (users.fields.getByName("kdf_salt")) {
    app.save(users);
  }

  let profiles;
  try {
    profiles = app.findCollectionByNameOrId("profiles");
  } catch {
    profiles = new Collection({
      type: "base",
      name: "profiles",
    });
  }

  addFieldIfMissing(profiles, new RelationField({
    name: "user",
    required: true,
    maxSelect: 1,
    collectionId: users.id,
    cascadeDelete: true,
  }));
  addFieldIfMissing(profiles, new TextField({ name: "profile_id", required: true, max: 128 }));
  addFieldIfMissing(profiles, new TextField({ name: "blob", required: true }));
  addFieldIfMissing(profiles, new TextField({ name: "nonce", required: true, max: 128 }));
  addFieldIfMissing(profiles, new NumberField({ name: "schema_version", required: true }));
  addFieldIfMissing(profiles, new TextField({ name: "device_id", required: true, max: 128 }));
  addFieldIfMissing(profiles, new NumberField({ name: "client_revision", required: true }));
  profiles.listRule = authRule;
  profiles.viewRule = authRule;
  profiles.createRule = authRule;
  profiles.updateRule = authRule;
  profiles.deleteRule = authRule;
  addIndexIfMissing(profiles, "idx_profiles_user_profile_id", true, "user, profile_id", "");
  app.save(profiles);

  let devices;
  try {
    devices = app.findCollectionByNameOrId("devices");
  } catch {
    devices = new Collection({
      type: "base",
      name: "devices",
    });
  }

  addFieldIfMissing(devices, new RelationField({
    name: "user",
    required: true,
    maxSelect: 1,
    collectionId: users.id,
    cascadeDelete: true,
  }));
  addFieldIfMissing(devices, new TextField({ name: "device_id", required: true, max: 128 }));
  addFieldIfMissing(devices, new TextField({ name: "name", required: true, max: 160 }));
  addFieldIfMissing(devices, new TextField({ name: "platform", required: true, max: 32 }));
  addFieldIfMissing(devices, new DateField({ name: "last_seen_at", required: false }));
  devices.listRule = authRule;
  devices.viewRule = authRule;
  devices.createRule = authRule;
  devices.updateRule = authRule;
  devices.deleteRule = authRule;
  addIndexIfMissing(devices, "idx_devices_user_device_id", true, "user, device_id", "");
  app.save(devices);
}, (app) => {
  for (const name of ["devices", "profiles"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch {
      // Collection does not exist.
    }
  }

  const users = app.findCollectionByNameOrId("users");
  const salt = users.fields.getByName("kdf_salt");
  if (salt) {
    users.fields.removeByName("kdf_salt");
    app.save(users);
  }
});
