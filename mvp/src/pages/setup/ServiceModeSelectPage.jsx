import { useLayoutEffect } from "react";
import { Card } from "../../components/ui/shadcn";
import { IconGlyph } from "../../components/ui/IconGlyph";
import { serviceModes } from "../../data/setupCatalog";
import "../../styles/service-mode-select.css";

export function ServiceModeSelectPage({ onSelect }) {
  useLayoutEffect(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
  }, []);

  return (
    <div className="setup-flow-page service-mode-page">
      <main className="service-mode-main" aria-label="서비스 모드 선택">
        <div className="service-mode-grid">
          {serviceModes.map((item) => (
            <Card className={`service-mode-card-v2 service-mode-card-v2--${item.id}`} key={item.id}>
              <button
                aria-label={item.label}
                aria-pressed="false"
                className="choice-card service-mode-card service-mode-card-button"
                type="button"
                onClick={() => onSelect(item.id)}
              >
                <ModePreview mode={item} />
                <strong className="service-mode-card-title">{item.label}</strong>
              </button>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}

function ModePreview({ mode }) {
  return (
    <span className={`service-mode-visual service-mode-visual--icon service-mode-visual--${mode.id} service-mode-visual--${mode.tone}`} aria-hidden="true">
      <IconGlyph icon={mode.icon} size={72} />
    </span>
  );
}
