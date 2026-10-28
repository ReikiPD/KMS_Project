import { useLayoutEffect, useRef } from "react";
import { Modal } from "@idds/react";
import usePublicOverlayFocus from "../../hooks/usePublicOverlayFocus";

function FocusContents({ title, onClose, restoreFocusRef, children }) {
  const content = useRef(null);
  usePublicOverlayFocus(true, ".kms-document-focus-dialog", onClose, restoreFocusRef);
  useLayoutEffect(() => {
    const dialog = content.current?.closest('[role="dialog"]');
    dialog?.setAttribute("aria-label", `Mode fokus: ${title}`);
    // The IDDS portal lives outside #root: make the covered application inert.
    const application = document.getElementById("root");
    const wasInert = application?.inert;
    if (application) application.inert = true;
    return () => { if (application) application.inert = wasInert; };
  }, [title]);
  return <div ref={content} className="kms-focus-contents">{children}</div>;
}

export default function FocusModal({ title, onClose, restoreFocusRef, children }) {
  return <Modal open onClose={onClose} hideHeader size="full" closeOnBackdrop={false} paddingBody="0" dialogClassname="kms-document-focus-dialog">
    <FocusContents title={title} onClose={onClose} restoreFocusRef={restoreFocusRef}>{children}</FocusContents>
  </Modal>;
}
