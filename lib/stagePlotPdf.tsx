// PDF export for a stage plot, built with @react-pdf/renderer (renders real
// PDF in the Node runtime — next/og's Satori only emits PNG, so it can't back a
// print-quality document). One library draws both the positioned diagram and
// the input-list table.
//
// Deliberately plain black-on-white with a red accent: this is a document a
// house engineer prints and marks up, not a branded web page. Emoji icons from
// the catalog aren't used here (react-pdf's default fonts don't render them) —
// each canvas item shows its text label instead.

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { catalogItem } from "./stagePlotCatalog.ts";
import {
  STAGE_CANVAS_ASPECT,
  type StagePlotDetail,
} from "./stagePlots.ts";

const RED = "#b42318";
const INK = "#1a1a1a";
const MUTED = "#555555";
const LINE = "#cccccc";

// Letter portrait, 40pt margins. The diagram fills the content width at the
// shared canvas aspect ratio, so a plot prints laid out exactly as edited.
const PAGE_PAD = 40;
const CONTENT_W = 612 - PAGE_PAD * 2; // 532
const DIAGRAM_H = CONTENT_W / STAGE_CANVAS_ASPECT;
const ITEM_W = 78;
const ITEM_H = 30;

const styles = StyleSheet.create({
  page: { padding: PAGE_PAD, fontSize: 9, color: INK, fontFamily: "Helvetica" },
  bandName: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  plotName: { fontSize: 12, color: RED, marginTop: 2, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 8, color: MUTED, marginTop: 3 },
  sectionLabel: {
    fontSize: 8,
    color: MUTED,
    marginTop: 16,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: "Helvetica-Bold",
  },
  diagram: {
    width: CONTENT_W,
    height: DIAGRAM_H,
    borderWidth: 1,
    borderColor: INK,
    borderStyle: "solid",
    position: "relative",
  },
  item: {
    position: "absolute",
    width: ITEM_W,
    height: ITEM_H,
    borderWidth: 1,
    borderColor: INK,
    borderStyle: "solid",
    borderRadius: 3,
    backgroundColor: "#f4f1ea",
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  itemLabel: { fontSize: 7, textAlign: "center", fontFamily: "Helvetica-Bold" },
  audienceBar: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 8,
    color: MUTED,
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
  },
  // Input list table
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, borderBottomStyle: "solid" },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, borderBottomStyle: "solid", backgroundColor: "#f4f1ea" },
  cell: { paddingVertical: 4, paddingHorizontal: 4 },
  headCell: { fontFamily: "Helvetica-Bold", fontSize: 8, color: RED },
  cCh: { width: 32 },
  cSource: { width: 200 },
  cNotes: { flex: 1 },
  empty: { fontSize: 9, color: MUTED, fontStyle: "italic", marginTop: 4 },
});

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

function StagePlotDoc({
  bandName,
  detail,
}: {
  bandName: string;
  detail: StagePlotDetail;
}) {
  const { plot, items, inputs } = detail;
  return (
    <Document title={`${bandName} — ${plot.name}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.bandName}>{bandName}</Text>
        <Text style={styles.plotName}>{plot.name}</Text>
        <Text style={styles.meta}>Stage plot · generated {formatDate(new Date())}</Text>

        <Text style={styles.sectionLabel}>Stage diagram</Text>
        <View style={styles.diagram}>
          {items.map((it) => {
            const label = it.label?.trim() || catalogItem(it.item_type).label;
            const left = Math.min(
              Math.max(it.x * CONTENT_W - ITEM_W / 2, 0),
              CONTENT_W - ITEM_W,
            );
            const top = Math.min(
              Math.max(it.y * DIAGRAM_H - ITEM_H / 2, 0),
              DIAGRAM_H - ITEM_H,
            );
            return (
              <View key={it.id} style={[styles.item, { left, top }]}>
                <Text style={styles.itemLabel}>{label}</Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.audienceBar}>▲ FRONT OF STAGE · AUDIENCE ▲</Text>

        <Text style={styles.sectionLabel}>Input list</Text>
        {inputs.length === 0 ? (
          <Text style={styles.empty}>No input channels.</Text>
        ) : (
          <View>
            <View style={styles.headRow}>
              <Text style={[styles.cell, styles.headCell, styles.cCh]}>#</Text>
              <Text style={[styles.cell, styles.headCell, styles.cSource]}>Source</Text>
              <Text style={[styles.cell, styles.headCell, styles.cNotes]}>Notes</Text>
            </View>
            {inputs.map((row, i) => (
              <View key={row.id} style={styles.row} wrap={false}>
                <Text style={[styles.cell, styles.cCh]}>{row.channel_number ?? i + 1}</Text>
                <Text style={[styles.cell, styles.cSource]}>{row.source}</Text>
                <Text style={[styles.cell, styles.cNotes]}>{row.notes ?? ""}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function renderStagePlotPdf(
  bandName: string,
  detail: StagePlotDetail,
): Promise<Buffer> {
  return renderToBuffer(<StagePlotDoc bandName={bandName} detail={detail} />);
}
