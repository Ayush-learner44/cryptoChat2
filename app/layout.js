import { Providers } from "./provider";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body >
        {children}
        <Providers />
      </body>
    </html>
  );
}
