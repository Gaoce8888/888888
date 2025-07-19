import React, { useRef, useState } from 'react';

interface Props {
  onRecorded: (audio: { dataUrl: string; blob: Blob; mimeType: string }) => void;
}

export default function VoiceRecorder({ onRecorded }: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recording, setRecording] = useState(false);

  const startRecording = async () => {
    if (!navigator.mediaDevices) {
      alert('当前浏览器不支持录音');
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];
    mediaRecorder.ondataavailable = (e) => {
      chunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
      const reader = new FileReader();
      reader.onloadend = () => {
        onRecorded({ dataUrl: reader.result as string, blob, mimeType: mediaRecorder.mimeType });
      };
      reader.readAsDataURL(blob);
      stream.getTracks().forEach((t) => t.stop());
    };
    mediaRecorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div style={{ margin: '8px 0' }}>
      {recording ? (
        <button onClick={stopRecording}>停止录音</button>
      ) : (
        <button onClick={startRecording}>开始录音</button>
      )}
    </div>
  );
}