"use client";

import React from "react";

/**
 * One column descriptor. ``render`` returns either a string/number or
 * arbitrary JSX. ``hideOnMobile`` lets you suppress noisy columns
 * (e.g. internal IDs, raw timestamps) from the stacked-card layout
 * below md while keeping them in the desktop table.
 */
export interface ResponsiveColumn<T> {
  key: string;
  /** Header label rendered both in desktop <th> and mobile card key. */
  label: string;
  /** How to render the cell value. Receives the full row. */
  render: (row: T) => React.ReactNode;
  /** Optional extra class on the desktop <td> + mobile value <dd>. */
  className?: string;
  /** Hide this column entirely below md (e.g. internal ID, raw ts). */
  hideOnMobile?: boolean;
  /** Render the value spanning the full card width on mobile (no
   *  label column) — useful for headlines / titles. */
  fullWidthOnMobile?: boolean;
}

export interface ResponsiveTableProps<T> {
  columns: ResponsiveColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Optional row click handler (works both desktop + mobile). */
  onRowClick?: (row: T) => void;
  /** Rendered when ``rows`` is empty. */
  emptyMessage?: React.ReactNode;
  /** Caller can override the mobile card rendering wholesale.
   *  Receives the row + the (filtered, hideOnMobile-respecting) columns.
   *  If omitted, a default <dl>-style stacked card is rendered. */
  mobileCardRenderer?: (row: T, columns: ResponsiveColumn<T>[]) => React.ReactNode;
  /** Optional extra class on the outer wrapper (e.g. ``mt-4``). */
  className?: string;
  /** Optional caption — visible above the table for accessibility. */
  caption?: string;
}

/**
 * Two-mode table: desktop <table>, mobile stacked cards.
 *
 * Why this exists. Audit 2026-05-03 found 8 pages where a wide HTML
 * <table> sat inside an ``overflow-x-auto`` wrapper — works but is
 * miserable on phone (tiny text + horizontal scroll). This component
 * gives a single migration path: pass columns + rows once, get both
 * behaviours for free.
 *
 * Migration. The minimum is:
 *   1. Re-shape your row data into a typed array (probably already is).
 *   2. Move each <th>/<td> into a ResponsiveColumn entry whose
 *      ``render`` matches what the <td> previously emitted.
 *   3. Delete the <table>/<thead>/<tbody>/<tr>/<th>/<td> JSX and the
 *      surrounding ``overflow-x-auto`` wrapper.
 * Use ``hideOnMobile`` for columns that don't add value on a phone.
 *
 * Escape hatches. Tables with row-expand-to-detail, custom headers,
 * or grouped rows can pass ``mobileCardRenderer`` to override the
 * default card layout while keeping the desktop table behaviour.
 */
export default function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = "Geen resultaten",
  mobileCardRenderer,
  className,
  caption,
}: ResponsiveTableProps<T>) {
  const mobileColumns = columns.filter((c) => !c.hideOnMobile);
  const isClickable = !!onRowClick;

  if (rows.length === 0) {
    return (
      <div
        className={`text-sm text-[var(--muted)] py-6 text-center bg-[var(--surface)] rounded-xl border border-[var(--border)] ${className ?? ""}`}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={className}>
      {caption && (
        <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2 px-1">
          {caption}
        </p>
      )}

      {/* ── Desktop / tablet: full table at md+ ───────────────────── */}
      <div className="hidden md:block bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)] text-xs">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-left px-4 py-3 font-medium ${col.className ?? ""}`}
                  scope="col"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={isClickable ? () => onRowClick!(row) : undefined}
                className={`border-b border-[var(--border)] last:border-0 ${
                  isClickable
                    ? "cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                    : ""
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 ${col.className ?? ""}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: stacked cards below md ────────────────────────── */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => {
          if (mobileCardRenderer) {
            return (
              <React.Fragment key={rowKey(row)}>
                {mobileCardRenderer(row, mobileColumns)}
              </React.Fragment>
            );
          }
          return (
            <DefaultMobileCard
              key={rowKey(row)}
              row={row}
              columns={mobileColumns}
              onClick={onRowClick}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Default stacked card. Two-column <dl> with the column label on
 * the left and the rendered value on the right. ``fullWidthOnMobile``
 * columns get their own row above the dl (typical for titles).
 */
function DefaultMobileCard<T>({
  row,
  columns,
  onClick,
}: {
  row: T;
  columns: ResponsiveColumn<T>[];
  onClick?: (row: T) => void;
}) {
  const fullWidth = columns.filter((c) => c.fullWidthOnMobile);
  const labeled = columns.filter((c) => !c.fullWidthOnMobile);
  const isClickable = !!onClick;

  return (
    <div
      onClick={isClickable ? () => onClick!(row) : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick!(row);
              }
            }
          : undefined
      }
      className={`bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 ${
        isClickable
          ? "cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
          : ""
      }`}
    >
      {fullWidth.map((col) => (
        <div key={col.key} className={`mb-2 ${col.className ?? ""}`}>
          {col.render(row)}
        </div>
      ))}
      {labeled.length > 0 && (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-sm">
          {labeled.map((col) => (
            <React.Fragment key={col.key}>
              <dt className="text-[var(--muted)] text-xs self-center">
                {col.label}
              </dt>
              <dd className={`text-zinc-200 ${col.className ?? ""}`}>
                {col.render(row)}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}
