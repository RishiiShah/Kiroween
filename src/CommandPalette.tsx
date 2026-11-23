import { Command } from "cmdk";
import { Icon, Kbd } from "./ui";

export type PaletteItem = {
  id: string;
  label: string;
  icon: string;
  hint?: string;
  keywords?: string[];
  disabled?: boolean;
  onSelect: () => void;
};
export type PaletteGroup = { heading: string; items: PaletteItem[] };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: PaletteGroup[];
  container: HTMLElement | null;
};

/** Keyboard-first launcher in the style of Linear, Raycast, and shadcn/ui. */
export function CommandPalette({ open, onOpenChange, groups, container }: Props) {
  const run = (item: PaletteItem) => {
    onOpenChange(false);
    item.onSelect();
  };
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      container={container ?? undefined}
      overlayClassName="palette-overlay"
      contentClassName="palette"
      loop
    >
      <div className="palette-input">
        <Icon name="search" size={16} />
        <Command.Input placeholder="Jump to a view, finding, action, or theme…" />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="palette-list">
        <Command.Empty className="palette-empty">
          No match. Try a finding title, “issues”, or “theme”.
        </Command.Empty>
        {groups
          .filter((group) => group.items.length)
          .map((group) => (
            <Command.Group key={group.heading} heading={group.heading}>
              {group.items.map((item) => (
                <Command.Item
                  key={item.id}
                  value={`${group.heading} ${item.label} ${item.id}`}
                  keywords={item.keywords}
                  disabled={item.disabled}
                  onSelect={() => run(item)}
                >
                  <Icon name={item.icon} size={15} />
                  <span className="palette-label">{item.label}</span>
                  {item.hint && <span className="palette-hint">{item.hint}</span>}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
      </Command.List>
      <div className="palette-foot">
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span>
          <Kbd>↵</Kbd> open
        </span>
        <span>
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> next / previous finding
        </span>
      </div>
    </Command.Dialog>
  );
}
