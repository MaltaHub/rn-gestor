
import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAvatarUpload } from "@/hooks/useAvatarUpload";
import { useAuth } from "@/contexts/AuthContext";

interface AvatarUploadProps {
  currentAvatar?: string | null;
  userName: string;
  onAvatarUpdate: (newAvatarUrl: string) => void;
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({
  currentAvatar,
  userName,
  onAvatarUpdate
}) => {
  const { user } = useAuth();
  const { uploadAvatar, isUploading } = useAvatarUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    const newAvatarUrl = await uploadAvatar(file, user.id);
    if (newAvatarUrl) {
      onAvatarUpdate(newAvatarUrl);
    }

    // Limpar input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <UserAvatar
        src={currentAvatar}
        alt={userName}
        fallback={userName.slice(0, 2)}
        className="h-24 w-24"
      />
      
      <Button
        onClick={handleUploadClick}
        disabled={isUploading}
        variant="outline"
        size="sm"
        className="flex items-center space-x-2"
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
        <span>
          {isUploading ? 'Enviando...' : 'Alterar Foto'}
        </span>
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <p className="text-xs text-gray-500 text-center">
        Formatos aceitos: JPG, PNG, GIF<br />
        Tamanho máximo: 5MB
      </p>
    </div>
  );
};

export default AvatarUpload;
