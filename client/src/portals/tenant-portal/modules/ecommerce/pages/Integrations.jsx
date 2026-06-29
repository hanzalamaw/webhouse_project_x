import { useState } from "react";
import { PageHeader } from "../../../../../components/PageHeader";
import { Button } from "../../../../../components/Button";
import ShopifyTab from "../components/ShopifyTab";
import DarazTab from "../components/DarazTab";
import { PLATFORMS } from "../constants";

export default function Integrations() {
  const [activePlatform, setActivePlatform] = useState("shopify");

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="Store Integrations"
        description="Connect Shopify and Daraz stores. OAuth credentials are configured on the server — sellers only authorize access."
      />

      <div className="wh-action-btns" style={{ marginBottom: "1.25rem" }}>
        {Object.values(PLATFORMS).map((platform) => (
          <Button
            key={platform.key}
            variant={activePlatform === platform.key ? "primary" : "secondary"}
            onClick={() => setActivePlatform(platform.key)}
          >
            {platform.title}
          </Button>
        ))}
      </div>

      {activePlatform === "shopify" && <ShopifyTab />}
      {activePlatform === "daraz" && <DarazTab />}
    </div>
  );
}
