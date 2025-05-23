
import React from "react";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DisplayField } from "./form/DisplayField";
import { NameField } from "./form/NameField";
import { BirthdateField } from "./form/BirthdateField";
import { BioField } from "./form/BioField";
import { AvatarUpload } from "./form/AvatarUpload";
import { EmailField } from "./form/EmailField";
import { JoinDateField } from "./form/JoinDateField";

interface ProfileDetailsFormProps {
  user: User | null;
  name: string | null;
  birthdate: string | null;
  bio: string | null;
  avatarUrl: string | null;
  joinDate: string | null;
  role: string | null;
  onLogout: () => void;
}

const ProfileDetailsForm: React.FC<ProfileDetailsFormProps> = ({
  user,
  name,
  birthdate,
  bio,
  avatarUrl,
  joinDate,
  onLogout
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <AvatarUpload avatarUrl={avatarUrl} name={name} />
        <Button onClick={onLogout} variant="outline">
          Sair
        </Button>
      </div>

      <Separator />

      <div className="space-y-4">
        <NameField name={name} />
        <EmailField email={user?.email} />
        <BirthdateField birthdate={birthdate} />
        <BioField bio={bio} />
        <JoinDateField joinDate={joinDate} />
      </div>
    </div>
  );
};

export default ProfileDetailsForm;
