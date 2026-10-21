/**
 * The phone app's sign-in code mail: the magic link's dark card, with a
 * 6-digit code to type in the app instead of a button.
 * Preview: `pnpm email:dev` (port 3003, not the app).
 */
import type { CSSProperties } from 'react'
import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from 'react-email'
import {
  BORDER,
  INK,
  body,
  brand,
  card,
  fine,
  heading,
  lede,
  logo,
  logoSrc,
  rule,
  shell,
  tagline,
} from './magic-link'

export interface SignInCodeEmailProps {
  /** Six digits. */
  code: string
  /** This ADHX's address, for the logo. */
  origin: string
}

export function SignInCodeEmail({ code, origin }: SignInCodeEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`Your ADHX code is ${code}. It expires in 15 minutes.`}</Preview>
      <Body style={body}>
        <Container style={shell}>
          <Row style={brand}>
            <Column style={{ verticalAlign: 'middle' }}>
              <Img src={logoSrc(origin)} width="91" height="32" alt="ADHX" style={logo} />
            </Column>
          </Row>

          <Section style={card}>
            <Heading as="h1" style={heading}>
              Your sign-in code
            </Heading>
            <Text style={lede}>Type this in the ADHX app on your phone. No password.</Text>
            <Text style={codeBox}>{code}</Text>
            <Hr style={rule} />
            <Text style={fine}>
              This code expires in 15 minutes and works once. If you didn’t ask for it, you can
              ignore this email.
            </Text>
          </Section>

          <Text style={tagline}>Your friends have better taste than the algorithm.</Text>
        </Container>
      </Body>
    </Html>
  )
}

SignInCodeEmail.PreviewProps = {
  code: '482913',
  origin: 'https://adhx.com',
} satisfies SignInCodeEmailProps

export default SignInCodeEmail

const codeBox: CSSProperties = {
  margin: 0,
  padding: '14px 0',
  border: `1px solid ${BORDER}`,
  borderRadius: '12px',
  textAlign: 'center',
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  fontSize: '32px',
  fontWeight: 600,
  letterSpacing: '8px',
  lineHeight: '40px',
  color: INK,
}
