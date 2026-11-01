# Fabrique les fichiers Word d'exemple de T2.18 (tests/core/wordImport*.test.ts), avec python-docx (MIT), qui part
# du modèle de document de Word lui-même (styles « Heading 1 », thème, numérotation), puis LibreOffice pour les
# variantes .doc, .odt et .docx de LibreOffice. Ne contient aucun document de la famille.
# Usage : python3 tests/fixtures/word/make_fixtures.py (depuis la racine du dépôt). Les fichiers produits sont
# commités ; ce script ne sert qu'à les refaire.
import copy
import io
import os
import subprocess
import tempfile

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_COLOR_INDEX
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Cm, Pt, RGBColor
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def png(width, height, color):
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, "PNG")
    buffer.seek(0)
    return buffer


def add_field(paragraph, code, result):
    """Champ complexe de Word (begin, code, separate, résultat, end)."""
    for xml in (
        f'<w:r {nsdecls("w")}><w:fldChar w:fldCharType="begin"/></w:r>',
        f'<w:r {nsdecls("w")}><w:instrText xml:space="preserve"> {code} </w:instrText></w:r>',
        f'<w:r {nsdecls("w")}><w:fldChar w:fldCharType="separate"/></w:r>',
        f'<w:r {nsdecls("w")}><w:t>{result}</w:t></w:r>',
        f'<w:r {nsdecls("w")}><w:fldChar w:fldCharType="end"/></w:r>',
    ):
        paragraph._p.append(parse_xml(xml))


def add_hyperlink(paragraph, url, text):
    rel = paragraph.part.relate_to(
        url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True
    )
    paragraph._p.append(
        parse_xml(
            f'<w:hyperlink {nsdecls("w", "r")} r:id="{rel}"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/>'
            f'<w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t>{text}</w:t></w:r></w:hyperlink>'
        )
    )


def complete():
    """Document qui reprend tout ce que le critère 2 demande."""
    doc = Document()
    section = doc.sections[0]
    # Format Lettre US en paysage, ramené à A4 (critère 2).
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = Cm(27.94), Cm(21.59)
    section.top_margin = section.bottom_margin = Cm(2)
    section.left_margin = section.right_margin = Cm(3)
    section.header.paragraphs[0].text = "Famille Martin"
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    add_field(footer, "PAGE", "1")

    doc.add_heading("Titre principal", level=1)
    doc.add_heading("Sous-titre", level=2)
    doc.add_heading("Section", level=3)
    p = doc.add_paragraph()
    p.add_run("gras").bold = True
    p.add_run(" ")
    p.add_run("italique").italic = True
    p.add_run(" ")
    p.add_run("souligné").underline = True
    p.add_run(" ")
    p.add_run("barré").font.strike = True
    p.add_run(" ")
    r = p.add_run("rouge")
    r.font.color.rgb = RGBColor(0xFF, 0x00, 0x00)
    p.add_run(" ")
    r = p.add_run("surligné")
    r.font.highlight_color = WD_COLOR_INDEX.YELLOW
    p.add_run(" H")
    p.add_run("2").font.subscript = True
    p.add_run("O et m")
    p.add_run("2").font.superscript = True

    p = doc.add_paragraph()
    for font, text in (("Times New Roman", "Times"), ("Courier New", "Courier"), ("Garamond", "Garamond"), ("Arial", "Arial")):
        run = p.add_run(text + " ")
        run.font.name = font
    run = p.add_run("grand")
    run.font.size = Pt(18)

    for align, text in ((WD_ALIGN_PARAGRAPH.CENTER, "Centré"), (WD_ALIGN_PARAGRAPH.RIGHT, "À droite"), (WD_ALIGN_PARAGRAPH.JUSTIFY, "Justifié")):
        doc.add_paragraph(text).alignment = align
    doc.add_paragraph("Double interligne").paragraph_format.line_spacing = 2.0
    doc.add_paragraph("Retrait de 2,5 cm").paragraph_format.left_indent = Cm(2.5)

    doc.add_paragraph("Puce un", style="List Bullet")
    doc.add_paragraph("Puce deux", style="List Bullet 2")
    doc.add_paragraph("Numéro un", style="List Number")
    doc.add_paragraph("Numéro deux", style="List Number")

    table = doc.add_table(rows=3, cols=3)
    table.style = "Table Grid"
    table.rows[0].cells[0].text = "Nom"
    table.rows[0].cells[1].text = "Âge"
    table.rows[0].cells[2].text = "Ville"
    table.rows[1].cells[0].text = "Élodie"
    table.rows[1].cells[1].text = "12"
    table.rows[1].cells[2].text = "Lyon"
    merged = table.rows[2].cells[0].merge(table.rows[2].cells[1])
    merged.text = "Fusionnée"
    tr_pr = table.rows[0]._tr.get_or_add_trPr()
    tr_pr.append(parse_xml(f'<w:tblHeader {nsdecls("w")}/>'))

    doc.add_picture(png(400, 200, (200, 30, 30)), width=Cm(8))
    p = doc.add_paragraph("Voir ")
    add_hyperlink(p, "https://example.org/", "le site")
    p = doc.add_paragraph("Avant le saut")
    p.add_run().add_break(WD_BREAK.PAGE)
    doc.add_paragraph("Après le saut : accents éèàçù, emoji 😀")
    doc.save(os.path.join(HERE, "complet.docx"))
    return os.path.join(HERE, "complet.docx")


def elements():
    """Document avec ce que le critère 3 signale : commentaire, suivi des modifications, zone de texte, note, champ."""
    doc = Document()
    p = doc.add_paragraph("Texte ")
    p._p.append(parse_xml(f'<w:ins {nsdecls("w")} w:id="1" w:author="A" w:date="2026-01-01T00:00:00Z"><w:r><w:t>ajouté</w:t></w:r></w:ins>'))
    p._p.append(parse_xml(f'<w:del {nsdecls("w")} w:id="2" w:author="A" w:date="2026-01-01T00:00:00Z"><w:r><w:delText>retiré</w:delText></w:r></w:del>'))
    p = doc.add_paragraph("Commenté")
    doc.add_comment(p.runs, text="Un commentaire", author="A")
    p = doc.add_paragraph("Note")
    p._p.append(parse_xml(f'<w:r {nsdecls("w")}><w:footnoteReference w:id="1"/></w:r>'))
    p = doc.add_paragraph("Date : ")
    add_field(p, "DATE", "01/01/2026")
    p = doc.add_paragraph()
    p._p.append(
        parse_xml(
            f'<w:r {nsdecls("w", "wp", "a")} xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
            '<w:drawing><wp:anchor><wp:extent cx="914400" cy="457200"/><wp:docPr id="5" name="Zone"/>'
            '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
            "<wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>Dans la zone</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp>"
            "</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>"
        )
    )
    doc.add_paragraph("Fin")
    doc.save(os.path.join(HERE, "elements-non-repris.docx"))


def libreoffice(source):
    """Variantes faites par LibreOffice : .doc (refusé), .odt (refusé) et .docx de LibreOffice (accepté)."""
    with tempfile.TemporaryDirectory() as out:
        for target, name in (("doc", "ancien.doc"), ("odt", "document.odt"), ("docx:MS Word 2007 XML", "libreoffice.docx")):
            subprocess.run(["soffice", "--headless", "--convert-to", target, "--outdir", out, source], check=True, capture_output=True)
            produced = os.path.join(out, "complet." + target.split(":")[0])
            os.replace(produced, os.path.join(HERE, name))


def protected():
    """Imitation d'un .docx protégé par un mot de passe : Word le range chiffré dans un fichier OLE, sous un flux
    « EncryptedPackage ». Seuls la signature OLE et ce nom de flux sont reproduits (aucun outil de chiffrement libre
    n'est disponible ici) : c'est ce que Nano Buro regarde pour reconnaître un fichier protégé."""
    header = bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]) + bytes(504)
    entry = "EncryptedPackage".encode("utf-16-le") + bytes(128 - 32)
    with open(os.path.join(HERE, "protege.docx"), "wb") as out:
        out.write(header + entry + bytes(4096))


if __name__ == "__main__":
    libreoffice(complete())
    elements()
    protected()
