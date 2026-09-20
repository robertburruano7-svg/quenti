import { useShortcut } from "@studyapp/lib/hooks/use-shortcut";

export const AnyKeyPressLayer = ({ onSubmit }: { onSubmit: () => void }) => {
  useShortcut([], onSubmit, {
    ctrlKey: false,
    anyKey: true,
    allowInput: true,
  });
  return null;
};
