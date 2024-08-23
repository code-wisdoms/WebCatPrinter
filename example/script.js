const messageElem = document.getElementById("message");
const printTableElem = document.getElementById("print-table");
const printTextElem = document.getElementById("print-text");

let bleDevice = null;
let printer = null;

const print = async (isTable = false) => {
  document.querySelectorAll("canvas").forEach((c) => c.remove());
  if (!bleDevice || !printer) {
    bleDevice = await WebCatPrinter.scan();
    printer = new WebCatPrinter.CatPrinter(bleDevice);
  }
  const lines = messageElem.value.split("\n");
  printer.newText();
  if (isTable) {
    const cellPad = [];
    cellPad[1] = 20;
    const heading = lines.shift();
    const footer = lines.pop();
    printer.addRow(heading, { font_size: 24, bold: true, cellPad });
    printer.newLine();
    printer.addSeparator();

    for (const words of lines) {
      printer.addRow(words, { font_size: 24, cellPad });
      printer.newLine();
    }
    printer.addSeparator();
    printer.addRow(footer, { font_size: 24, bold: true, cellPad });
    printer.newLine();
  } else {
    for (const line of lines) {
      printer.addText(line);
      printer.newLine();
    }
  }
  await printer.printText();
  await printer.finish(70);
};

printTableElem.addEventListener("click", () => print(true));
printTextElem.addEventListener("click", () => print());
