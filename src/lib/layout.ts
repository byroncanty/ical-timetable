export interface Laid<T> {
  item: T;
  col: number;
  cols: number;
}

/** Place overlapping blocks side by side: cluster overlaps, then greedily assign columns. */
export function layoutDay<T extends { startMin: number; endMin: number }>(items: T[]): Laid<T>[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: Laid<T>[] = [];
  let cluster: Laid<T>[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const l of cluster) l.cols = colEnds.length;
    out.push(...cluster);
    cluster = [];
    colEnds = [];
  };

  for (const item of sorted) {
    if (item.startMin >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= item.startMin);
    if (col === -1) col = colEnds.push(0) - 1;
    colEnds[col] = item.endMin;
    cluster.push({ item, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flush();
  return out;
}
