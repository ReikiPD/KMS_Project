import HomePage from "../features/public-home/HomePage";
import CataloguePage from "../features/public-catalogue/CataloguePage";

export default function Page({ catalogueOnly = false }) {
  return catalogueOnly ? <CataloguePage /> : <HomePage />;
}
