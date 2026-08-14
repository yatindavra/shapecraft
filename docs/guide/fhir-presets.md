# FHIR Presets

Ready-made FHIR R4 resource schemas for healthcare extraction, behind a separate (tree-shakeable) entrypoint. Each preset is an ordinary schema input, so it works with `generate()` and `generateStream()` unchanged - you get a typed, structurally-validated resource back.

```typescript
import { generate } from "@aviasole/shapecraft";
import { fhir } from "@aviasole/shapecraft/fhir";

const { data } = await generate(
  model,
  fhir.Patient,
  "John Doe, 35-year-old male, date of birth 1990-02-11."
);
// data: Patient  — { resourceType: "Patient", name: [{ family: "Doe", given: ["John"] }],
//                    gender: "male", birthDate: "1990-02-11" }
```

Five R4 resources are included: **`Patient`**, **`Observation`**, **`Condition`**, **`MedicationRequest`**, **`Encounter`**. Each models a practical common subset (not every field the spec allows) and enforces the required-bound value-set enums (`gender`, `status`, `intent`, …). Because they're JSON-object schemas, streaming `partial` events validate each top-level field as it arrives, for free.

## Extensions

Every preset also accepts an optional `extension?: Extension[]` (FHIR's mechanism for custom/local fields not in the base spec):

```typescript
const { data } = await generate(model, fhir.Patient, "...", { /* ... */ });
// data.extension: [{ url: "https://hospital-a.example.com/fhir/.../preferred-pharmacy", valueString: "Walgreens #4521" }]
```

`Extension` is a common-subset type too - `url` plus one of `valueString` / `valueInteger` / `valueBoolean` / `valueCodeableConcept` (real FHIR's `value[x]` has ~20 polymorphic variants; unsupported ones pass through unvalidated rather than being rejected, since `checkJsonSchema` has no `oneOf`).

Two things worth knowing before you rely on them:

- **`required` is opinionated, not FHIR cardinality.** FHIR marks almost nothing mandatory (a `Patient` with no name is technically valid FHIR). These presets require a *useful* minimum for extraction (e.g. `Patient` requires name + gender + birthDate). Where FHIR genuinely mandates a field (`Observation.status`/`code`, `MedicationRequest.status`/`intent`/`subject`), that's mirrored exactly.
- **Structural, not clinical.** A preset guarantees the resource is well-formed and required-fields-complete. It does **not** verify terminology codes (LOINC/SNOMED/RxNorm membership is not checked - a `Coding` is validated as having `system`/`code` strings, not as a real code), date formats, choice-type polymorphism (each preset commits to one `value[x]`/`medication[x]` variant, and `Extension` covers only its four most common `value[x]` variants), or any clinical invariant. **A structurally-valid FHIR resource is not the same as a correct or safe-to-act-on one** - see [Guarantees](/reference/guarantees).
