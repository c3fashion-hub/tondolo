import { Icon } from "./Icon";

type Props = {
  recording?: boolean;
  label?: string;
  stopLabel?: string;
  onClick?: () => void;
};

export function MicButton({ recording = false, label = "Speak a note", stopLabel = "Stop", onClick }: Props) {
  return (
    <button type="button" className={`tn-mic${recording ? " tn-mic-on" : ""}`} onClick={onClick} aria-pressed={recording}>
      <Icon name="mic" size={20} />
      <span>{recording ? stopLabel : label}</span>
    </button>
  );
}
