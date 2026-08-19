interface FilterChipProps {
  label: string;
  value: string;
  onRemove: () => void;
}

export function FilterChip({ label, value, onRemove }: FilterChipProps) {
  return (
    <div className="chip" role="group">
      <span>
        {label}: {value}
      </span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
      >
        ×
      </button>
    </div>
  );
}
