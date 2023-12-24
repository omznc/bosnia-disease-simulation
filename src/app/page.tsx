import dynamic from "next/dynamic";

const app = dynamic(() => import("./app"), { ssr: false });

export default app;