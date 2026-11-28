// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// The HLD as a Word document (.docx), written directly as WordprocessingML: no library, works offline,
// tested in Node. Headings use Word's built-in styles, so the navigation pane and the table of contents work.
import { zip, xml } from "./zip.js";
                                            
import { numbered } from "./number.js";

/** A diagram as a PNG, to embed where the HLD has its slot. Width and height in pixels at 96 dpi. */
                                                                   

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const EMU = 9525;                       // EMUs per pixel at 96 dpi
const TEXT_W = 12240 - 2 * 1080;        // Letter, 0.75" margins, in twips
const MAX_IMG_PX = (TEXT_W / 1440) * 96;

const run = (t        , rpr = "") => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
const para = (t        , style = "", rpr = "", ppr = "") => `<w:p>${style || ppr ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${ppr}</w:pPr>` : ""}${t ? run(t, rpr) : ""}</w:p>`;

function tableXml(head          , rows            , num           = [], showHead = true) {
  const cell = (t        , i        , hdr         ) => `<w:tc><w:tcPr>${hdr ? `<w:shd w:val="clear" w:color="auto" w:fill="E8EEF4"/>` : ""}</w:tcPr>` +
    `<w:p><w:pPr><w:pStyle w:val="TableText"/>${num.includes(i) ? `<w:jc w:val="right"/>` : ""}</w:pPr>${run(t, hdr ? "<w:b/>" : "")}</w:p></w:tc>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="autofit"/></w:tblPr>` +
    `<w:tblGrid>${head.map(() => `<w:gridCol/>`).join("")}</w:tblGrid>` +
    (showHead ? `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${head.map((h, i) => cell(h, i, true)).join("")}</w:tr>` : "") +
    rows.map(r => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => cell(c, i, false)).join("")}</w:tr>`).join("") + `</w:tbl>` + para("", "Spacer");
}

function imageXml(rid        , n        , img          , name        ) {
  const scale = Math.min(1, MAX_IMG_PX / img.w), cx = Math.round(img.w * scale * EMU), cy = Math.round(img.h * scale * EMU);
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="${xml(name)}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="${xml(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

/** The HLD as .docx bytes. Diagrams embed when their PNG is given; otherwise a note points to the diagram downloads. */
export function hldDocx(h     , images                                                    = {})             {
  const media                                                   = [];
  let pic = 0;
  const block = (b       )         => {
    switch (b.t) {
      case "p": return para(b.text);
      case "list": return b.items.map(t => `<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(t)}</w:p>`).join("");
      case "tbd": return para(b.text, "Tbd");
      case "ai": return para(`${b.label}${b.stale ? ". The design changed after this was drafted." : ""}`, "AiLabel") + b.paras.map(x => para(x, "AiText")).join("");
      case "table": return tableXml(b.head, b.rows, b.num);
      case "diagram": {
        const img = images[b.id];
        if (!img) return para(`Diagram: ${b.caption} (download it from the Design output page as SVG, PNG or draw.io).`, "Caption");
        const rid = `rIdImg${media.length + 1}`; media.push({ rid, file: `media/${b.id}.png`, png: img.png });
        return imageXml(rid, ++pic, img, b.id) + para(b.caption, "Caption");
      }
    }
  };
  const body           = [];
  // Cover
  body.push(para(h.title, "Title"), para(h.customer, "Subtitle"));
  body.push(tableXml(["", ""], [["Site", h.site || "–"], ["VCF version", h.version], ["Date", h.date], ["Status", h.status]], [], false));
  body.push(para(`Prepared with ${h.tool} by vCloudOne, an independent tool not affiliated with or endorsed by Broadcom. Sizing and licence figures are estimates to confirm before ordering.`, "Small"));
  body.push(para("Contents", "TOCHeading", "", `<w:pageBreakBefore/>`));
  body.push(`<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r></w:p>`);
  // The entries are written out too, so the contents show before Word updates the field (it adds page numbers).
  for (const { s, depth, n } of numbered(h)) body.push(para(`${n}  ${s.title}`, depth === 1 ? "TOC1" : "TOC2"));
  body.push(`<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`);
  for (const { s, depth, n } of numbered(h)) {
    body.push(para(`${n} ${s.title}`, depth === 1 ? "Heading1" : "Heading2", "", depth === 1 ? `<w:pageBreakBefore/>` : ""));
    for (const b of s.blocks) body.push(block(b));
  }
  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="540" w:footer="540" w:gutter="0"/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body.join("")}${sect}</w:body></w:document>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="${W}" xmlns:r="${R}"><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="${TEXT_W}"/></w:tabs></w:pPr>` +
    `${run(`${h.customer}: ${h.title}`)}<w:r><w:tab/></w:r>${run("Page ")}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run("1")}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  return zip([
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
      `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
      `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
      `<dc:title>${xml(`${h.customer}: ${h.title}`)}</dc:title><dc:creator>${xml(h.tool)} by vCloudOne</dc:creator></cp:coreProperties>` },
    { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rIdStyles" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="${R}/numbering" Target="numbering.xml"/>` +
      `<Relationship Id="rIdSettings" Type="${R}/settings" Target="settings.xml"/><Relationship Id="rIdFooter" Type="${R}/footer" Target="footer1.xml"/>` +
      media.map(m => `<Relationship Id="${m.rid}" Type="${R}/image" Target="${m.file}"/>`).join("") + `</Relationships>` },
    { name: "word/document.xml", data: document },
    { name: "word/footer1.xml", data: footer },
    { name: "word/styles.xml", data: STYLES },
    { name: "word/numbering.xml", data: NUMBERING },
    { name: "word/settings.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${W}"><w:updateFields w:val="true"/><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>` },
    ...media.map(m => ({ name: `word/${m.file}`, data: m.png })),
  ]);
}

const font = `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>`;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="2400" w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3A5F"/><w:sz w:val="52"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="480"/></w:pPr><w:rPr><w:color w:val="44546A"/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3A5F"/><w:sz w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="2E5C8A"/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="160"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3A5F"/><w:sz w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/><w:ind w:left="360"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Spacer"><w:name w:val="Spacer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="120" w:lineRule="exact"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Tbd"><w:name w:val="To Be Defined"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FFF4D6"/><w:ind w:left="120" w:right="120"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="C98A00"/></w:pBdr></w:pPr><w:rPr><w:i/><w:color w:val="6B4E00"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="AiLabel"><w:name w:val="AI Label"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="40"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="6B55B3"/></w:pBdr><w:ind w:left="120"/></w:pPr><w:rPr><w:b/><w:color w:val="6B55B3"/><w:sz w:val="16"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="AiText"><w:name w:val="AI Text"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="6B55B3"/></w:pBdr><w:ind w:left="120"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr><w:rPr><w:i/><w:color w:val="595959"/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Small"><w:name w:val="Small"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="595959"/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="7F7F7F"/><w:sz w:val="16"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7C4D1"/><w:left w:val="single" w:sz="4" w:color="B7C4D1"/><w:bottom w:val="single" w:sz="4" w:color="B7C4D1"/><w:right w:val="single" w:sz="4" w:color="B7C4D1"/><w:insideH w:val="single" w:sz="4" w:color="B7C4D1"/><w:insideV w:val="single" w:sz="4" w:color="B7C4D1"/></w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/>` +
  `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr></w:lvl></w:abstractNum>` +
  `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
