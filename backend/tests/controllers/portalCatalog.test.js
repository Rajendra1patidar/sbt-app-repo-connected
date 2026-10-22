jest.mock("../../models/PortalContent");
jest.mock("../../models/PortalItem");
jest.mock("../../models/Settings");
jest.mock("../../models/Customer");

const PortalContent = require("../../models/PortalContent");
const PortalItem = require("../../models/PortalItem");
const Settings = require("../../models/Settings");
const { _buildCatalog } = require("../../controllers/portalCatalogController");

const chain = (value) => {
  const c = { select: () => c, sort: () => c, lean: () => Promise.resolve(value) };
  return c;
};

describe("portal catalog", () => {
  const day = 86400000;
  test("only shows visible categories, shown items and live schemes; never exposes prices", async () => {
    PortalContent.findOne.mockReturnValue(chain({
      heroTitle: "Hello",
      categories: [{ _id: "c1", name: "Cement", visible: true, order: 1 }, { _id: "c2", name: "Hidden", visible: false, order: 0 }],
      schemes: [
        { _id: "s1", title: "Live", active: true, startsAt: new Date(Date.now() - day), endsAt: new Date(Date.now() + day) },
        { _id: "s2", title: "Expired", active: true, endsAt: new Date(Date.now() - day) },
        { _id: "s3", title: "Future", active: true, startsAt: new Date(Date.now() + day) },
        { _id: "s4", title: "Off", active: false },
      ],
    }));
    PortalItem.find.mockReturnValue(chain([{ _id: "i1", name: "Shown", description: "d", categoryId: "c1", photos: [], videoUrl: "" }]));
    Settings.findOne.mockReturnValue(chain({ orgName: "Shop", businessWhatsApp: "+91 98765-43210" }));

    const c = await _buildCatalog("owner1");
    expect(PortalItem.find).toHaveBeenCalledWith({ owner: "owner1", show: true });
    expect(c.categories.map((x) => x.name)).toEqual(["Cement"]);
    expect(c.schemes.map((x) => x.title)).toEqual(["Live"]);
    expect(c.items.map((x) => x.name)).toEqual(["Shown"]);
    expect(c.whatsapp).toBe("919876543210");
    expect(c.heroTitle).toBe("Hello");
    expect(JSON.stringify(c)).not.toMatch(/price|cost|stock/i);
  });

  test("handles an owner with no portal content yet", async () => {
    PortalContent.findOne.mockReturnValue(chain(null));
    PortalItem.find.mockReturnValue(chain([]));
    Settings.findOne.mockReturnValue(chain(null));
    const c = await _buildCatalog("owner2");
    expect(c.categories).toEqual([]);
    expect(c.schemes).toEqual([]);
    expect(c.items).toEqual([]);
  });
});
