const XLSX = require("xlsx");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

function formatExcelTime(value) {
    if (typeof value === "number") {
        const totalMinutes = Math.round(value * 24 * 60);
        const hours = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;

        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    return value || "";
}
// ============================================================
// FILE SETTINGS
// ============================================================

const excelFile = process.argv[2] || "./weight slips SUSANVAD.xlsx";
const outputFile =
    process.argv[3] ||
    path.join(
        __dirname,
        "output",
        "ALL-WEIGHT-ENTRIES.pdf"
    );

// ============================================================
// CHECK FILE
// ============================================================

if (!fs.existsSync(excelFile)) {
    console.error("ERROR: Excel file not found:");
    console.error(excelFile);
    process.exit(1);
}

// Create output folder if required
const outputDir = path.dirname(outputFile);

if (outputDir && outputDir !== ".") {
    fs.mkdirSync(outputDir, { recursive: true });
}

// ============================================================
// READ EXCEL
// ============================================================

const workbook = XLSX.readFile(excelFile);

// USE "Merged Cell" SHEET IF AVAILABLE
const sheetName = workbook.SheetNames.includes("Merged Cell")
    ? "Merged Cell"
    : workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

if (!sheet) {
    console.error("ERROR: Excel file has no sheets.");
    process.exit(1);
}

console.log("Using Excel sheet:", sheetName);

const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: ""
});

if (rows.length === 0) {
    console.error("ERROR: No data found in the selected Excel sheet.");
    process.exit(1);
}

console.log("======================================");
console.log("EXCEL DATA LOADED");
console.log("Sheet:", sheetName);
console.log("Total Entries:", rows.length);
console.log("======================================");

// ============================================================
// HELPERS
// ============================================================

function getValue(row, possibleNames) {
    for (const name of possibleNames) {
        if (
            row[name] !== undefined &&
            row[name] !== null &&
            row[name] !== ""
        ) {
            return row[name];
        }
    }

    return "";
}

// ------------------------------------------------------------
// DATE FORMAT
// ------------------------------------------------------------

function formatDate(value) {
    if (!value) return "";

    // Excel serial date
    if (typeof value === "number") {
        const date = XLSX.SSF.parse_date_code(value);

        if (date) {
            return (
                String(date.d).padStart(2, "0") +
                "/" +
                String(date.m).padStart(2, "0") +
                "/" +
                date.y
            );
        }
    }

    // JavaScript Date
    if (value instanceof Date && !isNaN(value)) {
        return (
            String(value.getDate()).padStart(2, "0") +
            "/" +
            String(value.getMonth() + 1).padStart(2, "0") +
            "/" +
            value.getFullYear()
        );
    }

    return String(value);
}

// ------------------------------------------------------------
// TIME FORMAT
// ------------------------------------------------------------

function formatTime(value) {
    if (value === undefined || value === null || value === "") {
        return "";
    }

    // Excel time/date-time stored as a number
    if (typeof value === "number") {
        const timePart = value % 1;

        const totalMinutes = Math.round(timePart * 24 * 60);

        const hours = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;

        return (
            String(hours).padStart(2, "0") +
            ":" +
            String(minutes).padStart(2, "0")
        );
    }

    // If time is already text
    if (typeof value === "string") {
        const match = value.match(/(\d{1,2}):(\d{2})/);

        if (match) {
            return (
                String(Number(match[1])).padStart(2, "0") +
                ":" +
                match[2]
            );
        }
    }

    return String(value);
}
// ------------------------------------------------------------
// NUMBER CLEANING
// ------------------------------------------------------------

function cleanNumber(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return "";
    }

    return String(value);
}

// ============================================================
// PDF SETTINGS
// ============================================================

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 323;
if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
    console.log("Old PDF deleted.");
}
const doc = new PDFDocument({
    size: [PAGE_WIDTH, PAGE_HEIGHT],

    margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
    },

    autoFirstPage: false
});

const outputStream = fs.createWriteStream(outputFile);

doc.pipe(outputStream);

// ============================================================
// CREATE ONE SLIP FOR EVERY EXCEL ENTRY
// ============================================================

rows.forEach((row, index) => {

    console.log(
        `Creating entry ${index + 1} of ${rows.length}`
    );

    // ========================================================
    // GET DATA
    // ========================================================

    const rstNo = getValue(row, [
        "RST NO",
        "RST No",
        "RST",
        "RST NO."
    ]);

    const vehicleNo = getValue(row, [
        "VEHICLE NO",
        "VEHICLE NO.",
        "Vehicle No",
        "Vehicle Number"
    ]);

    const vehicleType = getValue(row, [
        "VHL TYP",
        "VHL TYPE",
        "VEHICLE TYPE",
        "Vehicle Type"
    ]);

    const address = getValue(row, [
        "ADDRESS",
        "Address",
        "SITE",
        "Site"
    ]);

    const partyName = getValue(row, [
        "PARTY NAME",
        "PARTY",
        "Party Name"
    ]);

    const item = getValue(row, [
        "ITEM",
        "Item"
    ]);

    const gross = getValue(row, [
        "GROSS WT",
        "GROSS WT.",
        "GROSS",
        "Gross WT",
        "Gross"
    ]);

    const tareValue = Number(getValue(row, [
    "TARE WT",
    "TARE WT.",
    "TARE",
    "Tare WT",
    "Tare"
])) || 0;

const tare = Math.round(tareValue);

    const netValue = Number(getValue(row, [
    "NET WT",
    "NET WT,",
    "NET",
    "Net WT",
    "Net"
])) || 0;

// Round floating-point value and limit NET WT to 5 digits
let net = Math.round(netValue);

if (net > 99999) {
    net = 99999;
}

    const date = formatDate(
        getValue(row, [
            "DATE",
            "Date"
        ])
    );

    const loadTimeValue = getValue(row, [
  "LOAD",
  "Load",
  "LOAD TIME",
  "Load Time"
]);

const loadTime = formatTime(loadTimeValue);

    const emptyTime = formatTime(
        getValue(row, [
            "EMPTY",
            "EMPTY TIME",
            "EMPTY TIME.",
            "Empty",
            "Empty Time"
        ])
    );

    const charges =
        getValue(row, [
            "CHARGES",
            "Charges"
        ]) || "0";

    const phone =
        getValue(row, [
            "PHONE",
            "PH",
            "MOBILE",
            "PHONE NO"
        ]) || "123456";

    // ========================================================
    // NEW PDF PAGE
    // ========================================================

    doc.addPage({
        size: [PAGE_WIDTH, PAGE_HEIGHT],

        margins: {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0
        }
    });

    // ========================================================
    // FONT
    // ========================================================

    doc.font("Courier");

    // ========================================================
    // HEADER
    // ========================================================

    doc.fontSize(17)
        .font("Courier-Bold")
        .text(
            "R&B INFRA PROJECT PVT - LTD",
            0,
            25,
            {
                width: PAGE_WIDTH,
                align: "center"
            }
        );

    doc.fontSize(11)
        .font("Courier-Bold")
        .text(
            "MALJIPADA NAIGAON",
            0,
            45,
            {
                width: PAGE_WIDTH,
                align: "center"
            }
        );

    doc.text(
        "MUMBAI",
        0,
        59,
        {
            width: PAGE_WIDTH,
            align: "center"
        }
    );

    // ========================================================
    // FIRST DASHED LINE
    // ========================================================

    doc.font("Courier")
        .fontSize(10)
        .text(
            "------------------------------------------------------------------------------------",
            40,
            82
        );

    // ========================================================
    // TOP LEFT
    // ========================================================

    doc.fontSize(12)
        .font("Courier")

        .text(
            "RST No.       : " + rstNo,
            45,
            94
        )

        .text(
            "Vhl typ       : " + vehicleType,
            45,
            110
        )

        .text(
            "Address       : " + address,
            45,
            126
        );

    // ========================================================
    // TOP RIGHT
    // ========================================================

    doc.text(
        "Vehicle No. : " + vehicleNo,
        340,
        94
    );

    doc.text(
        "Party name  : " + partyName,
        340,
        110
    );

    doc.text(
        "Item        : " + item,
        340,
        126
    );

    // ========================================================
    // SECOND DASHED LINE
    // ========================================================

    doc.text(
        "----------------------------------------------------------------------",
        40,
        143
    );

    // ========================================================
    // GROSS
    // ========================================================

    doc.text(
        "Gross : " + cleanNumber(gross) + " Kg",
        45,
        157
    );

    doc.text(
        "Date: " + date,
        235,
        157
    );

    doc.text(
        "Time: " + loadTime,
        400,
        157
    );

    // ========================================================
    // TARE
    // ========================================================

    doc.text(
        "Tare  : " + cleanNumber(tare) + " Kg",
        45,
        174
    );

    doc.text(
        "Date: " + date,
        235,
        174
    );

    doc.text(
        "Time: " + emptyTime,
        400,
        174
    );

    // ========================================================
    // NET
    // ========================================================

    doc.text(
        "Net   : " + cleanNumber(net) + " Kg",
        45,
        191
    );

    // ========================================================
    // THIRD DASHED LINE
    // ========================================================

    doc.text(
        "----------------------------------------------------------------------",
        40,
        208
    );

    // ========================================================
    // CHARGES
    // ========================================================

    doc.text(
        "Charges       : Rs.     " + charges,
        45,
        222
    );

    // ========================================================
    // FOURTH DASHED LINE
    // ========================================================

    doc.text(
        "----------------------------------------------------------------------",
        40,
        242
    );

    // ========================================================
    // FOOTER
    // ========================================================

    doc.fontSize(11)
        .text(
            "Ph : " + phone,
            0,
            264,
            {
                width: PAGE_WIDTH,
                align: "center"
            }
        );

    doc.text(
        "! Thanks for your visit !",
        0,
        279,
        {
            width: PAGE_WIDTH,
            align: "center"
        }
    );
});

// ============================================================
// FINISH PDF
// ============================================================

doc.end();

outputStream.on("finish", () => {

    console.log("");
    console.log("======================================");
    console.log("ALL ENTRIES PDF CREATED");
    console.log("Total Entries:", rows.length);
    console.log("Sheet:", sheetName);
    console.log("File:", outputFile);
    console.log("======================================");

});

outputStream.on("error", (error) => {

    console.error("");
    console.error("PDF OUTPUT ERROR:");
    console.error(error);

});