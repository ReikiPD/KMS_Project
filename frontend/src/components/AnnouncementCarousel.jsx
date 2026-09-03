import { useEffect, useRef, useState } from "react";
import { Badge, Button, Skeleton } from "@idds/react";
import { ArrowLeft, ArrowRight, Building2, FileText, Megaphone, PlayCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import transportHero from "../assets/knowledge/transport-hero.png";
import { uploadUrl } from "../lib/api";
import { publicAssetPath } from "../lib/routes";

const AUTOPLAY_INTERVAL_MS = 6500;

const announcementDestination = (announcement) => (
  announcement?.asset ? publicAssetPath(announcement.asset) : announcement?.link_url || ""
);

export default function AnnouncementCarousel({ announcements = [], loading = false }) {
  const navigate = useNavigate();
  const pointerStart = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(announcements.length - 1, 0)));
  }, [announcements.length]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener?.("change", updatePreference);
    return () => mediaQuery.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || announcements.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % announcements.length);
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [announcements.length, paused, reducedMotion]);

  const showSlide = (index) => {
    if (!announcements.length) return;
    setActiveIndex((index + announcements.length) % announcements.length);
  };

  const openDestination = (announcement) => {
    const destination = announcementDestination(announcement);
    if (!destination) return;
    if (destination.startsWith("/")) {
      navigate(destination);
      return;
    }
    const opened = window.open(destination, "_blank", "noopener,noreferrer");
    if (opened) opened.opener = null;
  };

  const finishSwipe = (event) => {
    if (pointerStart.current === null) return;
    const distance = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(distance) < 55) return;
    showSlide(activeIndex + (distance < 0 ? 1 : -1));
  };

  if (!loading && !announcements.length) return null;

  return (
    <section className="kms-home-section kms-home-section--announcement kms-home-reveal py-10" aria-labelledby="announcement-heading">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="kms-section-eyebrow"><Megaphone size={16} /> Informasi penting</p>
          <h2 id="announcement-heading" className="kms-section-title">Pengumuman</h2>
        </div>
      </div>

      {loading ? <Skeleton height="390px" rounded="lg" /> : (
        <div
          className="kms-announcement-carousel"
          role="region"
          aria-roledescription="carousel"
          aria-label="Pengumuman KMS Kemenhub"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
          }}
          onPointerDown={(event) => { pointerStart.current = event.clientX; }}
          onPointerUp={finishSwipe}
          onPointerCancel={() => { pointerStart.current = null; }}
        >
          <div className="kms-announcement-viewport">
            <div
              className="kms-announcement-track"
              style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
            >
              {announcements.map((announcement, index) => {
                const asset = announcement.asset;
                const video = asset?.asset_type === "video";
                const imageSource = uploadUrl(announcement.image_url || asset?.thumbnail_url) || transportHero;
                const destination = announcementDestination(announcement);
                const TypeIcon = video ? PlayCircle : FileText;
                const unitName = asset?.parent_work_unit_alias || asset?.parent_work_unit_name || asset?.work_unit_alias || asset?.work_unit_name;
                return (
                  <article
                    key={announcement.public_id}
                    className="kms-announcement-slide"
                    aria-roledescription="slide"
                    aria-label={`${index + 1} dari ${announcements.length}: ${announcement.title}`}
                    aria-hidden={index !== activeIndex}
                  >
                    <img src={imageSource} alt="" className="kms-announcement-backdrop" loading={index === 0 ? "eager" : "lazy"} />
                    <div className="kms-announcement-overlay" aria-hidden="true" />
                    <div className="kms-announcement-content">
                      <Badge className="kms-announcement-badge w-fit" type="soft" variant="neutral" size="md" prefixIcon={asset ? <TypeIcon size={15} /> : <Megaphone size={15} />}>
                        {asset ? "Referensi pengetahuan" : "Pengumuman KMS"}
                      </Badge>
                      <h3>{announcement.title}</h3>
                      <p className="kms-announcement-copy">{announcement.content}</p>
                      {asset && (
                        <div className="kms-announcement-asset-meta">
                          <span><TypeIcon size={16} />{video ? "Video pembelajaran" : "Dokumen pengetahuan"}</span>
                          {unitName && <span><Building2 size={16} />{unitName}</span>}
                        </div>
                      )}
                      {destination && (
                        <Button hierarchy="primary" className="kms-announcement-cta w-fit" suffixIcon={<ArrowRight size={16} />} onClick={() => openDestination(announcement)} tabIndex={index === activeIndex ? 0 : -1}>
                          {asset ? (announcement.link_label || "Lihat pengetahuan") : (announcement.link_label || "Lihat selengkapnya")}
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {announcements.length > 1 && (
            <>
              <button type="button" className="kms-announcement-arrow kms-announcement-arrow--previous" onClick={() => showSlide(activeIndex - 1)} aria-label="Pengumuman sebelumnya"><ArrowLeft size={22} /></button>
              <button type="button" className="kms-announcement-arrow kms-announcement-arrow--next" onClick={() => showSlide(activeIndex + 1)} aria-label="Pengumuman berikutnya"><ArrowRight size={22} /></button>
              <div className="kms-announcement-dots" aria-label="Pilih pengumuman">
                {announcements.map((announcement, index) => (
                  <button
                    key={announcement.public_id}
                    type="button"
                    className={`kms-announcement-dot ${index === activeIndex ? "kms-announcement-dot--active" : ""}`}
                    onClick={() => showSlide(index)}
                    aria-label={`Tampilkan pengumuman ${index + 1}: ${announcement.title}`}
                    aria-current={index === activeIndex ? "true" : undefined}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
