import { useState } from 'react';
import { Button, Text } from '@mantine/core';
import { invoke } from '@tauri-apps/api/core'; 
import { open } from '@tauri-apps/plugin-dialog';
//import { readTextFile, readFile } from '@tauri-apps/plugin-fs';

export default function FilePicker() {
   const [picked, setPicked] = useState<string | null>(null);
   const [text, setText] = useState<string | null>(null);

   const pickFile = async () => {
      const selected = await open({
         multiple: false,
         directory: false,
         filters: [{ name: 'Data files', extensions: ['xlsx', 'xls', 'csv'] }], //, 'json'
      });
      if (!selected) return; // user cancelled      
      const path = Array.isArray(picked) ? picked[0] : picked;
      setPicked(path);
      
      const contents = await invoke<string>('read_file_to_string', { path });
      setText(contents);

      //const text = await readTextFile(path); // CSV/JSON
      //const bytes = await readFile(path); // XLSX
   };

   return (
      <>
         <Button onClick={pickFile}>Import file…</Button>
         {picked && <Text mt="sm">Selected: {picked}</Text>}
         {text && <Text mt="sm">Preview: {text.slice(0, 120)}…</Text>}
      </>
   );
}
