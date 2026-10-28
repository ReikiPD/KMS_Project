import {INTERNAL_KINDS} from '../lib/internalAssets';
import word from '../../../assets/file-icons/word.svg';
import presentation from '../../../assets/file-icons/presentation.svg';
import spreadsheet from '../../../assets/file-icons/spreadsheet.svg';
import pdf from '../../../assets/file-icons/pdf.svg';
import audio from '../../../assets/file-icons/audio.svg';
import video from '../../../assets/file-icons/video.svg';
import image from '../../../assets/file-icons/image.svg';
import other from '../../../assets/file-icons/other.svg';
const icons={word,presentation,spreadsheet,pdf,audio,video,image,other};
export default function InternalFileBadge({kind}){
 const key=Object.hasOwn(icons,kind)?kind:'other';
 const label=INTERNAL_KINDS.find(item=>item.value===key)?.label||'File lainnya';
 return <span title={label} role="img" aria-label={label} className="kms-internal-file-badge"><img src={icons[key]} width="32" height="32" alt="" aria-hidden="true" draggable="false"/></span>;
}
