# What shapecraft guarantees - and what it doesn't

Every mechanism in the [Backends & Guarantee Levels](/guide/backends) guide (`native`, `constrained`, `best-effort` + retry) targets one thing: **the output is structurally valid** - it parses, the types match, required fields are present and non-empty. That's a real, load-bearing guarantee: it's the difference between code that can trust `result.data.age` is a `number` versus code that has to defensively re-check everything the model says.

What it doesn't cover is **whether a value is actually true.** A schema (or GBNF grammar) constrains *shape*, not *content* - a model can be perfectly schema-compliant while filling a field from its own priors instead of your source text. For example: a required `date` field that always parses, always matches the type, and is occasionally fabricated because the source text simply didn't contain a date. Nothing in `required`, type-checking, or `enforceLiterals` catches that - none of it throws, because nothing about the output is structurally wrong.

So think of it as two layers:

- **Structural correctness** (shapecraft's job): valid JSON/XML, correct types, required fields present. Solved.
- **Semantic correctness** ("is this value actually grounded in the input?"): shapecraft doesn't check this for you by default - `required`/type-checking alone can't. What it does provide is the hook: `semanticValidator` in the [Staged Validation Pipeline](/guide/staged-validation-pipeline) runs your own grounding check (e.g. verifying an extracted value traces back to the source text) after structural validation passes, and fails/retries the attempt exactly like a schema violation if it doesn't hold. If your use case needs that guarantee - financial data, dates, anything where a plausible-but-wrong value is costly - write that check and pass it in, rather than trusting `required` alone.

This isn't a reason to avoid structural validation - it eliminates an entire class of bugs (parse errors, wrong types, missing fields) that would otherwise hit you in production. It just isn't the same guarantee as "this value is correct," and knowing the boundary is what lets you build the right check on top for the cases that need one.
