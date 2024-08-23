const typescript = require("@rollup/plugin-typescript");
const license = `/*\n* Web Cat Printer\n* (c) 2023-present Raza (Code-wisdoms)\n* distributed under MIT license\n*/`;

module.exports = {
  input: "src/index.ts",
  output: [
    {
      file: "dist/bundle.cjs.js",
      format: "cjs",
      sourcemap: true,
      banner: license,
    },
    {
      file: "dist/bundle.esm.js",
      format: "esm",
      sourcemap: true,
      banner: license,
    },
    {
      file: "dist/bundle.umd.js",
      format: "umd",
      name: "WebCatPrinter",
      sourcemap: true,
      banner: license,
    },
  ],
  plugins: [typescript()],
};
