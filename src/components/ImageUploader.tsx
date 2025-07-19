import React from 'react';

interface Props {
  onImageText: (text: string, dataUrl: string) => void;
}

export default function ImageUploader({ onImageText }: Props) {
  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const res = await fetch('http://localhost:6006/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: dataUrl }),
        });
        const data = await res.json();
        onImageText(data.text, dataUrl);
      } catch (err) {
        console.error('OCR failed', err);
        onImageText('【OCR失败】', dataUrl);
      }
    };
    reader.readAsDataURL(file);
  }

  return <input type="file" accept="image/*" onChange={onSelect} />;
}