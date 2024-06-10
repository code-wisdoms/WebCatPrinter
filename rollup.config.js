const typescript = require("@rollup/plugin-typescript");

module.exports = {
  input: "src/index.ts",
  output: [
    {
      file: "dist/bundle.cjs.js",
      format: "cjs",
      sourcemap: true,
    },
    {
      file: "dist/bundle.esm.js",
      format: "esm",
      sourcemap: true,
    },
    {
      file: "dist/bundle.umd.js",
      format: "umd",
      name: "MyLibrary",
      sourcemap: true,
    },
  ],
  plugins: [typescript()],
};
