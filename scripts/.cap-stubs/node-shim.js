export default {};
export const createHash = () => ({ update: () => ({ digest: () => '' }) });
export const randomBytes = () => '';
export const AsyncLocalStorage = class { run(_, f) { return f(); } getStore() { return undefined; } };
export class Readable { static from() { return { pipe() {} }; } }
export class Transform {}
export class PassThrough {}
