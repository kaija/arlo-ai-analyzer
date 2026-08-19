import React from "react";

interface StatTileProps {
  label: string;
  value: string;
  infoDot?: React.ReactNode; // optional InfoDot child
  sub?: string; // optional subtitle text
  subGood?: boolean; // when true, apply good-color class to sub
}

export function StatTile({ label, value, infoDot, sub, subGood }: StatTileProps) {
  return (
    <div className="stat-tile">
      <div className="stat-label">
        {label}
        {infoDot}
      </div>
      <div className="stat-value tnum">{value}</div>
      {sub && <div className={`stat-sub${subGood ? " good" : ""}`}>{sub}</div>}
    </div>
  );
}
