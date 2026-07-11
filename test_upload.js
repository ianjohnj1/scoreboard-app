import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://henoedqzusmnxtxdsyuc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhlbm9lZHF6dXNtbnh0eGRzeXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzQ0NTQsImV4cCI6MjA5NjExMDQ1NH0.DepqlsJoYdzHl9K9byapoV8cQ92c3iACGzLkwQC75n8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpload() {
  const fileContent = new Blob(['test image content'], { type: 'image/jpeg' });
  const fileName = 'test_user/test_image.HEIC';

  console.log('Attempting to upload...');
  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(fileName, fileContent);

  if (error) {
    console.error('Upload failed:', error);
  } else {
    console.log('Upload succeeded:', data);
  }
}

testUpload();
