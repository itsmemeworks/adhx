/**
 * Magic-link mail — the same always-dark SignInModal card, sent as HTML.
 * Preview: `pnpm email:dev` (port 3003, not the app).
 */
import type { CSSProperties } from 'react'
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from 'react-email'

export type MagicLinkIntent = 'signin' | 'change'

export interface MagicLinkEmailProps {
  url: string
  intent: MagicLinkIntent
}

const STAGE = '#08070a'
const INK = '#f3ece0'
const MUTED = '#857a69'
const SUBTLE = '#b8ac99'
const PANEL = '#201b16'
const BORDER = '#322b23'
const CLAY = '#e88a5e'
const CLAY_GRAD = 'linear-gradient(135deg,#e88a5e,#d26b40)'
/** Production origin so email clients can fetch the dark-surface lockup. */
const LOGO_SRC = 'https://adhx.com/logo-dark.png'

const copy = {
  signin: {
    preview: 'Your sign-in link — expires in 15 minutes',
    heading: 'Sign in to ADHX',
    body: "One tap, no password. Click below and you're in.",
    cta: 'Sign in',
    fine: "This link expires in 15 minutes. If you didn't request this, you can ignore this email.",
  },
  change: {
    preview: 'Confirm your new ADHX email — expires in 15 minutes',
    heading: 'Confirm your new email',
    body: 'Click below to confirm this address for your ADHX account.',
    cta: 'Confirm email',
    fine: "This link expires in 15 minutes. If you didn't request this, you can ignore this email.",
  },
} as const

export function MagicLinkEmail({ url, intent }: MagicLinkEmailProps) {
  const t = copy[intent]

  return (
    <Html lang="en">
      <Head>
        {/* @font-face only — do not use <Font>, it stamps Indie Flower onto * */}
        <style>{`
          @font-face {
            font-family: 'Indie Flower';
            font-style: normal;
            font-weight: 400;
            src: url(https://fonts.gstatic.com/s/indieflower/v21/m8JVjfNVeGBW1T1uaspDAe4I.woff2) format('woff2');
          }
        `}</style>
      </Head>
      <Preview>{t.preview}</Preview>
      <Body style={body}>
        <Container style={shell}>
          <Row style={brand}>
            <Column style={{ verticalAlign: 'middle' }}>
              <Img src={LOGO_SRC} width="91" height="32" alt="ADHX" style={logo} />
            </Column>
          </Row>

          <Section style={card}>
            <Heading as="h1" style={heading}>
              {t.heading}
            </Heading>
            <Text style={lede}>{t.body}</Text>
            <Button href={url} style={cta}>
              {t.cta}
            </Button>
            <Text style={pasteHint}>Or paste this link into your browser:</Text>
            <Link href={url} style={pasteLink}>
              {url}
            </Link>
            <Hr style={rule} />
            <Text style={fine}>{t.fine}</Text>
          </Section>

          <Text style={tagline}>Save it. Lose it. Find it.</Text>
        </Container>
      </Body>
    </Html>
  )
}

MagicLinkEmail.PreviewProps = {
  url: 'https://adhx.com/api/auth/email/callback?token=preview',
  intent: 'signin',
} satisfies MagicLinkEmailProps

export default MagicLinkEmail

const body: CSSProperties = {
  margin: 0,
  padding: '40px 16px',
  backgroundColor: STAGE,
  color: INK,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}

const shell: CSSProperties = {
  maxWidth: '420px',
  margin: '0 auto',
}

const brand: CSSProperties = {
  padding: '0 4px 20px',
}

const logo: CSSProperties = {
  display: 'block',
}

const card: CSSProperties = {
  backgroundColor: PANEL,
  border: `1px solid ${BORDER}`,
  borderRadius: '16px',
  padding: '28px',
}

const heading: CSSProperties = {
  margin: '0 0 10px',
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: '24px',
  fontWeight: 400,
  lineHeight: '1.25',
  color: INK,
}

const lede: CSSProperties = {
  margin: '0 0 24px',
  fontSize: '14px',
  lineHeight: '1.5',
  color: MUTED,
}

const cta: CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: CLAY,
  backgroundImage: CLAY_GRAD,
  color: '#ffffff',
  fontSize: '14.5px',
  fontWeight: 600,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  lineHeight: '48px',
  textAlign: 'center',
  textDecoration: 'none',
  borderRadius: '999px',
  padding: '0 24px',
}

const pasteHint: CSSProperties = {
  margin: '24px 0 6px',
  fontSize: '12px',
  lineHeight: '1.4',
  color: SUBTLE,
}

const pasteLink: CSSProperties = {
  display: 'block',
  fontSize: '12px',
  lineHeight: '1.45',
  color: MUTED,
  textDecoration: 'none',
  wordBreak: 'break-all',
}

const rule: CSSProperties = {
  border: 'none',
  borderTop: `1px solid ${BORDER}`,
  margin: '24px 0 16px',
}

const fine: CSSProperties = {
  margin: 0,
  fontSize: '12px',
  lineHeight: '1.45',
  color: SUBTLE,
}

const tagline: CSSProperties = {
  margin: '20px 4px 0',
  fontSize: '12px',
  lineHeight: '1.4',
  color: SUBTLE,
  textAlign: 'center',
}
