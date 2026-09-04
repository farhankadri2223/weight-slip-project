const {
    Client,
    LocalAuth
} = require("whatsapp-web.js");

const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");


// ============================================================
// PATHS
// ============================================================

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "output");
const generateScript = path.join(__dirname, "generate.js");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}


// ============================================================
// WHATSAPP CLIENT
// ============================================================

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "weight-slip-bot"
    }),

    puppeteer: {
        headless: true,

        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage"
        ]
    }
});


// ============================================================
// QR
// ============================================================

client.on("qr", (qr) => {
    console.log("\n=================================");
    console.log("SCAN THIS QR CODE WITH WHATSAPP");
    console.log("=================================\n");

    qrcode.generate(qr, {
        small: true
    });
});


// ============================================================
// READY
// ============================================================

client.on("ready", () => {
    console.log("\n=================================");
    console.log("WHATSAPP BOT READY");
    console.log("=================================\n");
});


// ============================================================
// AUTHENTICATED
// ============================================================

client.on("authenticated", () => {
    console.log("WhatsApp authenticated successfully.");
});


// ============================================================
// AUTH FAILURE
// ============================================================

client.on("auth_failure", (message) => {
    console.error("WhatsApp authentication failed:");
    console.error(message);
});


// ============================================================
// DISCONNECTED
// ============================================================

client.on("disconnected", (reason) => {
    console.log("WhatsApp disconnected:");
    console.log(reason);
});


// ============================================================
// MESSAGE HANDLER
// ============================================================

client.on("message", async (message) => {

    try {

        console.log("\n---------------------------------");
        console.log("NEW MESSAGE RECEIVED");
        console.log("---------------------------------");

        console.log("FROM:", message.from);
        console.log("HAS MEDIA:", message.hasMedia);
        console.log("TYPE:", message.type);


        // ----------------------------------------------------
        // Ignore messages without media
        // ----------------------------------------------------

        if (!message.hasMedia) {
            console.log("No media. Ignoring.");
            return;
        }


        // ----------------------------------------------------
        // MIME TYPE
        // ----------------------------------------------------

        const mimeType =
            message._data?.mimetype ||
            message.rawData?.mimetype ||
            "";

        console.log("MIME TYPE:", mimeType);


        // ----------------------------------------------------
        // Only Excel files
        // ----------------------------------------------------

        const isExcel =
            mimeType ===
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||

            mimeType ===
                "application/vnd.ms-excel";


        if (!isExcel) {
            console.log("Not an Excel file. Ignoring.");
            return;
        }


        console.log("\nExcel file detected.");
        console.log("Starting download...");


        // ====================================================
        // DOWNLOAD MEDIA
        // ====================================================

        let media = null;

        for (let attempt = 1; attempt <= 3; attempt++) {

            try {

                console.log(
                    `Downloading Excel... Attempt ${attempt}/3`
                );


                // ------------------------------------------------
                // IMPORTANT:
                // Repair WhatsApp's new $1 serialized ID format
                // ------------------------------------------------

                if (
                    message.id &&
                    message.id.$1 &&
                    !message.id._serialized
                ) {

                    console.log(
                        "Detected WhatsApp $1 message ID."
                    );

                    const id = message.id;

                    if (
                        id.fromMe !== undefined &&
                        id.remote &&
                        id.id
                    ) {

                        id._serialized =
                            `${id.fromMe}_${id.remote}_${id.id}`;

                        console.log(
                            "Reconstructed message ID:",
                            id._serialized
                        );
                    }
                }


                // ------------------------------------------------
                // Try normal download
                // ------------------------------------------------

                media = await message.downloadMedia();


                if (media) {

                    console.log(
                        "Excel downloaded successfully."
                    );

                    break;
                }


                console.log(
                    "downloadMedia() returned null."
                );

            } catch (error) {

                console.error(
                    `Download attempt ${attempt} failed:`
                );

                console.error(error);


                if (attempt < 3) {

                    console.log(
                        "Waiting 2 seconds before retry..."
                    );

                    await new Promise(resolve =>
                        setTimeout(resolve, 2000)
                    );
                }
            }
        }


        // ====================================================
        // DOWNLOAD FAILED
        // ====================================================

        if (!media) {

            console.error(
                "================================="
            );

            console.error(
                "EXCEL DOWNLOAD FAILED"
            );

            console.error(
                "================================="
            );

            try {
                await message.reply(
                    "Excel file download nahi ho paya. Please file dobara bhejo."
                );
            } catch (replyError) {
                console.error(
                    "Could not send failure message:",
                    replyError
                );
            }

            return;
        }


        // ====================================================
        // FILE NAME
        // ====================================================

        let originalName =
            media.filename ||
            "weight-slip.xlsx";


        // Remove dangerous characters
        originalName = originalName.replace(
            /[<>:"/\\|?*\x00-\x1F]/g,
            "_"
        );


        // Make sure extension is Excel
        if (
            !originalName.toLowerCase().endsWith(".xlsx") &&
            !originalName.toLowerCase().endsWith(".xls")
        ) {

            originalName += ".xlsx";
        }


        // ====================================================
        // SAVE FILE
        // ====================================================

        const timestamp =
            new Date()
                .toISOString()
                .replace(/[:.]/g, "-");


        const fileName =
            `${timestamp}_${originalName}`;


        const excelPath =
            path.join(uploadDir, fileName);


        console.log(
            "Saving Excel:",
            excelPath
        );


        fs.writeFileSync(
            excelPath,
            Buffer.from(media.data, "base64")
        );


        console.log(
            "Excel saved successfully."
        );


        // ====================================================
        // RUN GENERATE.JS
        // ====================================================

        if (!fs.existsSync(generateScript)) {

            console.error(
                "generate.js not found!"
            );

            await message.reply(
                "Excel download ho gaya, lekin generate.js nahi mila."
            );

            return;
        }


        console.log(
            "Starting PDF generation..."
        );


        execFile(
            process.execPath,
            [generateScript, excelPath],
            {
                cwd: __dirname,
                windowsHide: true
            },

            async (error, stdout, stderr) => {

                if (stdout) {
                    console.log(
                        "\nGENERATE OUTPUT:\n",
                        stdout
                    );
                }


                if (stderr) {
                    console.error(
                        "\nGENERATE ERROR:\n",
                        stderr
                    );
                }


                if (error) {

                    console.error(
                        "PDF generation failed:"
                    );

                    console.error(error);

                    try {
                        await message.reply(
                            "Excel download ho gaya, lekin PDF generate karte waqt error aaya."
                        );
                    } catch (replyError) {
                        console.error(replyError);
                    }

                    return;
                }


                console.log(
                    "PDF generation completed."
                );


                // ------------------------------------------------
                // Find newest PDF in output folder
                // ------------------------------------------------

                let pdfFiles = [];

                try {

                    pdfFiles = fs.readdirSync(outputDir)
                        .filter(file =>
                            file.toLowerCase().endsWith(".pdf")
                        )
                        .map(file => {

                            const fullPath =
                                path.join(outputDir, file);

                            return {
                                file,
                                fullPath,
                                time: fs.statSync(fullPath).mtimeMs
                            };
                        })
                        .sort((a, b) =>
                            b.time - a.time
                        );

                } catch (readError) {

                    console.error(
                        "Could not read output folder:",
                        readError
                    );
                }


                if (pdfFiles.length === 0) {

                    console.error(
                        "No PDF found in output folder."
                    );

                    try {
                        await message.reply(
                            "PDF generate command complete hua, lekin output folder mein PDF nahi mila."
                        );
                    } catch (replyError) {
                        console.error(replyError);
                    }

                    return;
                }


                const latestPdf =
                    pdfFiles[0].fullPath;


                console.log(
                    "PDF FOUND:",
                    latestPdf
                );


                // =================================================
                // SEND PDF BACK TO WHATSAPP
                // =================================================

                try {

                    const {
                        MessageMedia
                    } = require("whatsapp-web.js");


                    const pdfMedia =
                        MessageMedia.fromFilePath(
                            latestPdf
                        );


                    await client.sendMessage(
                        message.from,
                        pdfMedia,
                        {
                            sendMediaAsDocument: true
                        }
                    );


                    console.log(
                        "PDF sent successfully."
                    );

                } catch (sendError) {

                    console.error(
                        "PDF sending failed:"
                    );

                    console.error(sendError);

                    try {
                        await message.reply(
                            "PDF ban gaya hai, lekin WhatsApp par send nahi ho paya."
                        );
                    } catch (replyError) {
                        console.error(replyError);
                    }
                }
            }
        );

    } catch (error) {

        console.error(
            "\nUNEXPECTED MESSAGE ERROR:"
        );

        console.error(error);

    }

});


// ============================================================
// CLIENT ERROR
// ============================================================

client.on("error", (error) => {
    console.error(
        "WhatsApp client error:"
    );

    console.error(error);
});


// ============================================================
// START
// ============================================================

console.log(
    "\nStarting WhatsApp bot..."
);

client.initialize();