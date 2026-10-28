import { UnsavedChangesModal } from "./AssetFormStatus";

export default function FormDraftStatus({ guard }) {
  return <>
    {guard.dirty && <p className="kms-dirty-indicator" role="status">● Perubahan belum disimpan</p>}
    <UnsavedChangesModal open={guard.open} onStay={guard.stay} onLeave={guard.leave} />
  </>;
}
