import { NAV, NAV_BLURB, OWNER_ONLY_NAV_IDS, PROFILE_MEMBERS } from "../../lib/constants";
import { useTheme } from "../../hooks/useTheme";
import { Avatar, Group, GroupRow, Sheet, Switch } from "../ui/kit";
import { MoonIcon, SignOutIcon, SunIcon, WhatsAppIcon } from "../ui/icons";
import { waLink } from "../../lib/contactLinks";

/** The profile menu: Settings, Audit log, Customer portal — plus appearance and sign out. */
export function ProfileSheet({ onClose, onNav, onSignOut, settings, role, businessWa, onWhatsApp }: {
  onClose: () => void; onNav: (view: string) => void; onSignOut: () => void; settings: any; role: string;
  businessWa?: string; onWhatsApp?: () => void;
}) {
  const { isDark, toggleTheme } = useTheme();
  const isOwner = role !== "staff";
  const members = PROFILE_MEMBERS.filter((id) => isOwner || !OWNER_ONLY_NAV_IDS.has(id));

  return (
    <Sheet onClose={onClose} label="Profile menu" title="Profile">
      <Group>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Avatar name={settings?.ownerName || "Owner"} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold leading-[22px] text-ink">{settings?.ownerName || "Owner"}</p>
            <p className="truncate text-caption text-mute">{settings?.orgName}{isOwner ? "" : " · Staff"}</p>
          </div>
        </div>
      </Group>

      <Group className="mt-3">
        {members.map((id) => {
          const n = NAV.find((x) => x.id === id);
          if (!n) return null;
          return (
            <GroupRow key={id} chevron onClick={() => { onClose(); onNav(id); }} className="min-h-[56px] py-2">
              <p className="text-[16px] text-ink">{n.label}</p>
              <p className="text-micro text-mute">{NAV_BLURB[id]}</p>
            </GroupRow>
          );
        })}
      </Group>

      <Group className="mt-3">
        <GroupRow className="h-14">
          <div className="flex items-center gap-3">
            {isDark ? <MoonIcon size={20} className="text-mute" /> : <SunIcon size={20} className="text-mute" />}
            <span className="text-[16px] text-ink">Dark mode</span>
          </div>
          <Switch checked={isDark} onChange={() => toggleTheme()} label="Dark mode" />
        </GroupRow>
        {businessWa ? (
          <a href={waLink(businessWa, "Hi, I have a question about my account.")} target="_blank" rel="noreferrer" onClick={onClose}
            className="flex h-14 items-center gap-3 border-t border-line px-4 text-[16px] text-ink">
            <WhatsAppIcon size={20} className="text-mute" /> Message the business on WhatsApp
          </a>
        ) : (
          <GroupRow onClick={() => { onClose(); onWhatsApp?.(); }} className="h-14">
            <div className="flex items-center gap-3 text-[16px] text-ink"><WhatsAppIcon size={20} className="text-mute" /> Message the business on WhatsApp</div>
          </GroupRow>
        )}
        <GroupRow onClick={() => { onClose(); onSignOut(); }} className="h-14">
          <div className="flex items-center gap-3 text-bad-500">
            <SignOutIcon size={20} />
            <span className="text-[16px] font-medium">Sign out</span>
          </div>
        </GroupRow>
      </Group>
    </Sheet>
  );
}
