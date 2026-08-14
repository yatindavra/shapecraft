# CLI

Validate an already-produced JSON file against a raw JSON Schema file, without writing any code:

```bash
npx shapecraft validate --schema schema.json --output output.json
```

`schema.json` is a raw JSON Schema (the same shape as the `{ jsonSchema }` `SchemaInput`), `output.json` is the data to check against it. Runs the same `checkJsonSchema` structural check `generate()` uses internally - `required` fields must be present and non-empty, `type`/`enum` must match, nested `properties`/`items` are checked recursively. Exits `0` and prints `✓ ... matches ...` on success; exits `1` and prints the specific violation (e.g. `Missing required property: "age"`) on failure. Useful in CI to check a fixture or a recorded model output against a schema without spinning up a full `generate()` call.
