
import React from "react";

export const CollaboratorLoader: React.FC = () => {
  return (
    <div className="content-container py-6">
      <div className="card">
        <div className="py-8">
          <div className="flex justify-center">
            <div className="animate-pulse h-20 w-20 rounded-full bg-vehicleApp-lightGray"></div>
          </div>
          <div className="mt-4 flex justify-center">
            <div className="animate-pulse h-8 w-40 rounded bg-vehicleApp-lightGray"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
