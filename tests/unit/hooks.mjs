// Lets Node load the app's modules, which (like Vite) import files without
// the ".js" extension.
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (e) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[cm]?js$/.test(specifier)) return next(`${specifier}.js`, context);
    throw e;
  }
}
