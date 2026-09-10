"use client";

import { FolderOpen, Upload } from "lucide-react";
import { Button } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type { ContentAsset } from "@/lib/content-assets/types";
import AssetFileCard from "./AssetFileCard";

type AssetGridViewProps = {
  assets: ContentAsset[];
  onOpenViewer: (assetId: string) => void;
  onUploadClick?: () => void;
};

export default function AssetGridView({ assets, onOpenViewer, onUploadClick }: AssetGridViewProps) {
  const { isZh } = useAppI18n();

  if (assets.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
        <FolderOpen className="h-12 w-12 text-foreground/15" strokeWidth={1} />
        <p className="text-[14px] font-medium text-foreground/50">
          {isZh ? "此文件夹为空" : "This folder is empty"}
        </p>
        <p className="text-[13px] text-foreground/30">
          {isZh ? "上传文件或新建文档开始使用" : "Upload files or create a document to get started"}
        </p>
        {onUploadClick && (
          <Button
            size="sm"
            className="mt-2 bg-accent text-white rounded-[4px] hover:bg-accent/90"
            onPress={onUploadClick}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {isZh ? "上传文件" : "Upload Files"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {assets.map((asset) => (
        <AssetFileCard key={asset.id} asset={asset} onOpen={onOpenViewer} />
      ))}
    </div>
  );
}
