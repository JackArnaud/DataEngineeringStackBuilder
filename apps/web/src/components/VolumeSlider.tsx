import { formatVolume, sliderFromVolume, volumeFromSlider, DEFAULT_VOLUME_GB, VOLUME_SLIDER_STEPS } from "../landing";

interface Props {
  /** `undefined` before the question has been answered; the control still needs a visual position, so it starts at `DEFAULT_VOLUME_GB` until dragged. */
  volumeGb: number | undefined;
  onChange: (volumeGb: number) => void;
  id: string;
}

/**
 * A log-scale volume control (1 GB to 1 PB/month), replacing the old three-bucket Scale question:
 * cost varies by orders of magnitude with real volume, not a linear amount, so the slider position
 * maps exponentially. `aria-valuetext` carries the formatted label so a screen reader announces
 * "≈500 GB/month", not a raw 0-1000 position; the native input already supplies
 * aria-valuenow/min/max from its own value/min/max attributes.
 */
export function VolumeSlider({ volumeGb, onChange, id }: Props) {
  const shown = volumeGb ?? DEFAULT_VOLUME_GB;
  const pos = sliderFromVolume(shown);
  const label = formatVolume(shown);
  return (
    <div className="volumeslider">
      <input
        type="range"
        id={id}
        className="volumeslider__input"
        min={0}
        max={VOLUME_SLIDER_STEPS}
        value={pos}
        aria-label="Pipeline volume per month"
        aria-valuetext={label}
        onChange={(e) => onChange(volumeFromSlider(Number(e.target.value)))}
      />
      <output className="volumeslider__value" htmlFor={id}>
        {label}
      </output>
    </div>
  );
}
