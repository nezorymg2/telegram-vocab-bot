const mammoth = require("mammoth");
const fs = require("fs");

mammoth.convertToHtml({ path: "Must-have IELTS Vocabulary.docx" })
    .then(function(result) {
        const html = result.value;
        const matches = [...html.matchAll(/<tr>(.*?)<\/tr>/gs)];
        const words = [];
        for (const m of matches) {
            const tds = [...m[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/g)];
            if (tds.length >= 2) {
                const word = tds[0][1].replace(/<[^>]+>/g, '').trim();
                const translation = tds[1][1].replace(/<[^>]+>/g, '').trim();
                if (word && translation && !/^word$/i.test(word) && !/^translation$/i.test(translation)) {
                    words.push({ word, translation });
                }
            }
        }
        fs.writeFileSync("ielts.json", JSON.stringify(words, null, 2), "utf8");
        console.log("Done! Words:", words.length);
    })
    .catch(function(err) {
        console.error(err);
    });
