const typescript = require("@rollup/plugin-typescript");

module.exports = {
  input: "src/index.ts",
  output: [
    {
      file: "dist/bundle.cjs.js",
      format: "cjs",
      sourcemap: true,
      banner: `/*\n* Web Cat Printer\n* (c) 2023-${new Date().getFullYear()} Ahmed Raza\n* Cannot use, copy, modify, and/or distribute this software for any purpose with or without fee.\n*/`
    },
    {
      file: "dist/bundle.esm.js",
      format: "esm",
      sourcemap: true,
      banner: `/*\n* Web Cat Printer\n* (c) 2023-${new Date().getFullYear()} Ahmed Raza\n* Cannot use, copy, modify, and/or distribute this software for any purpose with or without fee.\n*/`
    },
    {
      file: "dist/bundle.umd.js",
      format: "umd",
      name: "WebCatPrinter",
      sourcemap: true,
      banner: `/*\n* Web Cat Printer\n* (c) 2023-${new Date().getFullYear()} Ahmed Raza\n* Cannot use, copy, modify, and/or distribute this software for any purpose with or without fee.\n*/`
    },
  ],
  plugins: [typescript()],
};
