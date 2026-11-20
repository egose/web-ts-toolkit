# EMAIL-01 packaging decision and handoff

This note accompanies the [task record](../../../tasks/20261118-223259-email-service-package.md#email-01--scaffold-package-and-public-boundaries).
It supplements the frozen [EMAIL-00 contract](v1-contract.md) without rewriting the design or its original evidence.

## SMTP dependency decision

Replace the proposed Nodemailer 7 peer/API baseline with Nodemailer `>=10.6.0 <11`. The registry reported `7.0.13`
as the newest 7.x release, covered by high-severity advisories including `GHSA-p6gq-j5cr-w38f` and
`GHSA-2x7j-588g-ccc2`. The registry's bulk advisory lookup returned no known matches for the direct versions selected
here: Nodemailer `10.6.0` (the stable `latest`), Mongoose `9.12.2`, and Handlebars `4.7.10`. This was a point-in-time
direct-version check, not a full dependency or transport audit.

Nodemailer `10.6.0` ships its own declarations and exposes `nodemailer/lib/mail-composer` and
`nodemailer/lib/smtp-connection` for both module formats. Do not add the older `@types/nodemailer` declarations.
Use an internal narrow transport port if needed; the public `SmtpProviderOptions`, submission evidence, TLS and hard
I/O deadline requirements are unchanged.
The manifest pins the peer floors as exact development dependencies. Mongoose stays `>=9.12.2 <10`, Handlebars
`~4.7.10` is the only runtime dependency, and the package still requires Node `>=24`. Peer declaration/runtime
compatibility with the implemented adapters is evidence for EMAIL-04/05 and EMAIL-11, not established by this scaffold.

## Boundary for the next tasks

- `packages/email-service/src/contracts/` owns the shared DTOs and service/provider/store interfaces.
  In EMAIL-02 use `TemplateDefinitions<T>` for the registry factory's mapped definition constraint, rather than
  retyping it. The root only re-exports contracts and the working `EmailError`.
- `packages/email-service/src/constants.ts` holds internal V1 defaults, budgets and limits. Reuse these rather
  than setting adapter-local defaults. `src/errors.ts` is the fixed error-code/message boundary.
- `src/smtp.ts`, `src/sendgrid.ts`, and `src/mongoose.ts` (relative to the package) currently export only option
  types. Add the actual factory in its owning task (EMAIL-05, EMAIL-06, EMAIL-04 respectively), keeping optional
  imports and peer-dependent types out of the root. Extend the installed fixture for these peer-specific imports
  when those factories and their peer-dependent declarations land. Do not add fake runtime factories.
- `build:package` is the only dist writer. The ordinary tarball fixture under `packages/email-service/test/packed-consumer/`
  reads its output and performs a normal pnpm install with auto peer installation enabled; it does not rebuild.
  Keep the standard workspace scripts, CI/group activation, real adapter tests and release-shaped pack verification
  in their owning phases.

The maintained tests are the reproduction source. No third-party source, generated tarballs, transient logs,
installed consumers, caches or Node binaries are archived or required from this run. No mail was submitted.
