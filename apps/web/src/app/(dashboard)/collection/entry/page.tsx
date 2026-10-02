import { redirect } from 'next/navigation'

// Encode Project Data is retired (V4-C11); old links land on Collection.
export default function CollectionEntryPage() {
  redirect('/collection')
}
