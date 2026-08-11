import { PageHeader, SectionCard, InfoRow } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export interface ProfileInfo {
  name: string;
  avatar: string;
  role: string;
  school: string;
  identifier: { label: string; value: string };
  email: string;
  extra?: { label: string; value: string }[];
}

export function ProfilePage({ profile }: { profile: ProfileInfo }) {
  return (
    <>
      <PageHeader title="Profile" description="Your personal and institutional information." />

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <SectionCard>
          <div className="flex flex-col items-center text-center">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-primary/15 font-display text-2xl font-bold text-primary">
              {profile.avatar}
            </span>
            <h2 className="mt-4 text-lg font-bold">{profile.name}</h2>
            <p className="text-sm text-muted-foreground">{profile.role}</p>
            <p className="mt-1 text-xs text-muted-foreground">{profile.school}</p>
            <Button variant="outline" size="sm" className="mt-4">
              Change photo
            </Button>
          </div>
          <div className="mt-6">
            <InfoRow label={profile.identifier.label} value={profile.identifier.value} />
            <InfoRow label="Email" value={profile.email} />
            {profile.extra?.map((e) => <InfoRow key={e.label} label={e.label} value={e.value} />)}
          </div>
        </SectionCard>

        <SectionCard title="Edit details" description="Keep your contact information current">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              toast.success("Profile updated");
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="fullname">Full name</Label>
              <Input id="fullname" defaultValue={profile.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" type="email" defaultValue={profile.email} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" type="tel" defaultValue="+234 802 411 9034" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ident">{profile.identifier.label}</Label>
              <Input id="ident" defaultValue={profile.identifier.value} readOnly />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="addr">Contact address</Label>
              <Input id="addr" defaultValue="12 University Road, Example City" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Save profile</Button>
            </div>
          </form>
        </SectionCard>
      </div>
    </>
  );
}
