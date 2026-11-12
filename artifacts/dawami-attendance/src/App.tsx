import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { arSA } from '@clerk/localizations';
import {
  Activity, ArrowDownLeft, ArrowUpRight, BadgeCheck, CalendarDays, Check, ChevronDown, Clock3,
  CreditCard, Download, Fingerprint, House, LogOut, Menu, Plus, Search, ShieldCheck,
  Smartphone, Users, X, ChartNoAxesColumnIncreasing, CircleAlert, RefreshCw,
} from 'lucide-react';
import {
  getGetCompanyQueryKey, getGetDashboardSummaryQueryKey, getGetMonthlyReportQueryKey,
  getListAttendanceQueryKey, getListEmployeesQueryKey, useCreateCompany, useCreateEmployee,
  useCreateEmployeeNfcToken, useDeleteEmployee, useGetCompany, useGetDashboardSummary,
  useGetMonthlyReport, useHealthCheck, useListAttendance, useListEmployees,
  useTapNfcAttendance, useUpdateEmployee,
} from '@workspace/api-client-react';
import type { Employee, EmployeeInput, EmployeeUpdate } from '@workspace/api-client-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { Button } from './components/button';
import { EmployeeDialog } from './components/employee-dialog';
import { Modal } from './components/modal';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const todayISO = () => new Date().toLocaleDateString('en-CA');
const currentMonth = () => todayISO().slice(0, 7);

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#294b40',
    colorForeground: '#263b34',
    colorMutedForeground: '#718079',
    colorDanger: '#b3453e',
    colorBackground: '#fffdf8',
    colorInput: '#fffdf8',
    colorInputForeground: '#263b34',
    colorNeutral: '#263b34',
    fontFamily: "'IBM Plex Sans Arabic', sans-serif",
    borderRadius: '.85rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf8] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#263b34] font-bold',
    headerSubtitle: 'text-[#718079]',
    socialButtonsBlockButtonText: 'text-[#263b34]',
    formFieldLabel: 'text-[#33473f]',
    footerActionLink: 'text-[#294b40] font-semibold',
    footerActionText: 'text-[#718079]',
    dividerText: 'text-[#718079]',
    identityPreviewEditButton: 'text-[#294b40]',
    formFieldSuccessText: 'text-[#294b40]',
    alertText: 'text-[#8d3832]',
    logoBox: 'rounded-xl overflow-hidden',
    logoImage: 'object-contain',
    socialButtonsBlockButton: 'border-[#e5dfd2] hover:bg-[#f5f0e6]',
    formButtonPrimary: 'bg-[#294b40] hover:bg-[#203d34] text-white',
    formFieldInput: 'border-[#ded8cb] bg-[#fffdf8] text-[#263b34]',
    footerAction: 'text-[#718079]',
    dividerLine: 'bg-[#e5dfd2]',
    alert: 'bg-[#fbefeb] border-[#efd4ce]',
    otpCodeFieldInput: 'border-[#ded8cb] text-[#263b34]',
    formFieldRow: 'text-[#33473f]',
    main: 'text-[#263b34]',
  },
};

function Logo({ inverted = false }: { inverted?: boolean }) {
  return <Link href="/" className={`brand ${inverted ? 'brand-inverted' : ''}`} data-testid="link-brand">
    <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
    <span className="brand-word">دوامي</span>
  </Link>;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} aria-hidden="true" />;
}

function QueryState({ loading, error, retry, children }: { loading: boolean; error: boolean; retry: () => void; children: ReactNode }) {
  if (loading) return <div className="space-y-4" data-testid="state-loading">
    <Skeleton className="h-28 w-full" /><Skeleton className="h-52 w-full" />
  </div>;
  if (error) return <div className="state-panel" data-testid="state-error">
    <span className="state-icon"><CircleAlert size={21} /></span>
    <h3>تعذر تحميل البيانات</h3><p>تحقق من الاتصال ثم أعد المحاولة.</p>
    <Button onClick={retry} className="button-secondary"><RefreshCw size={16} /> إعادة المحاولة</Button>
  </div>;
  return <>{children}</>;
}

function Home() {
  const health = useHealthCheck();
  const statusLabel = health.data?.status === 'ok' ? 'الخدمة تعمل' : 'جاهزون لمساعدتك';
  return <main className="landing grain" dir="rtl">
    <header className="landing-nav wrap">
      <Logo />
      <nav className="landing-links">
        <a href="#how" data-testid="link-how">كيف يعمل</a>
        <a href="#features" data-testid="link-features">المزايا</a>
        <Link href="/sign-in" className="nav-signin" data-testid="link-sign-in">تسجيل الدخول <ArrowUpRight size={15} /></Link>
      </nav>
    </header>
    <section className="hero wrap">
      <div className="hero-copy enter">
        <div className="eyebrow"><span className="live-dot" /> متابعة الدوام صارت أوضح</div>
        <h1>الدوام يمشي.<br /><em>وأنت مطمئن.</em></h1>
        <p className="hero-lede">كل حضور فريقك في مكان واحد. لمسة بطاقة، وسجل واضح — بلا دفاتر ولا تخمين.</p>
        <div className="hero-actions">
          <Link href="/sign-up" className="button button-primary" data-testid="link-create-account">ابدأ مجانًا <ArrowUpRight size={17} /></Link>
          <a href="#how" className="text-link" data-testid="link-learn-more">اكتشف كيف يعمل <ArrowDownLeft size={16} /></a>
        </div>
        <div className="hero-proof"><ShieldCheck size={17} /><span>سجل يومي محفوظ وآمن</span><span className="proof-divider" /><span>مصمم لأعمالك اليومية</span></div>
      </div>
      <div className="hero-art enter-delay" aria-label="معاينة لوحة متابعة الحضور" data-testid="visual-dashboard">
        <div className="art-sun" />
        <div className="dash-preview">
          <div className="preview-top"><div><small>مساحة العمل</small><b>مخبز رغيف</b></div><span className="preview-date">الأربعاء، ١٨ يونيو</span></div>
          <div className="preview-greeting">صباح الخير، <b>سارة</b></div>
          <div className="preview-kpis">
            <div className="preview-kpi highlight"><span>حاضرون الآن</span><strong>١٢</strong><small>من أصل ١٥ عاملًا</small><div className="mini-bars"><i /><i /><i /><i /><i /><i /></div></div>
            <div className="preview-kpi"><span>وصلوا متأخرين</span><strong>٢</strong><small>اليوم حتى الآن</small><div className="late-mark">٠٧ <small>دقيقة</small></div></div>
          </div>
          <div className="preview-list-head"><b>آخر الحركات</b><span>عرض الكل</span></div>
          <div className="preview-row"><span className="avatar avatar-gold">م</span><span className="preview-name">مها السالم<small>صانعة مخبوزات</small></span><span className="preview-time">٠٧:٥٨</span><span className="preview-pill">حضور</span></div>
          <div className="preview-row"><span className="avatar avatar-sage">ع</span><span className="preview-name">عمر ناصر<small>كاشير</small></span><span className="preview-time">٠٨:١١</span><span className="preview-pill late">تأخير ١١ د</span></div>
          <div className="preview-row"><span className="avatar avatar-rose">ر</span><span className="preview-name">ريم فهد<small>مشرفة الوردية</small></span><span className="preview-time">٠٨:١٤</span><span className="preview-pill">حضور</span></div>
        </div>
        <div className="floating-note"><span className="note-icon"><Fingerprint size={18} /></span><span><b>لمسة واحدة</b><small>وسُجل الحضور</small></span><Check size={16} className="note-check" /></div>
        <div className="art-caption">متابعة يومك، في لمحة.</div>
      </div>
    </section>
    <section className="trust-strip wrap" id="features">
      <span>كل ما تحتاجه لتسيير يوم العمل</span><b><Users size={17} /> فريقك واضح</b><b><Clock3 size={17} /> وقتك محسوب</b><b><CreditCard size={17} /> حضور بلمسة</b><b><ChartNoAxesColumnIncreasing size={17} /> تقارير مفهومة</b>
    </section>
    <section className="story-section wrap" id="how">
      <div className="section-kicker">01 / يوم أسهل</div>
      <div className="story-grid">
        <h2>خلّ الدفتر<br />للحكايات،<br /><span>مو للحضور.</span></h2>
        <div className="story-text"><p>دوامي يساعد صاحب العمل يتابع فريقه بدون ما يوقف شغله. أضف عمالك، جهّز بطاقاتهم، وخلك على اطلاع من هاتفك.</p><p>سجل واحد يجمع الحضور والانصراف والتأخير — واضح اليوم، ومرتب آخر الشهر.</p><Link href="/sign-up" className="text-link dark-link" data-testid="link-start-story">جهّز مساحة عملك <ArrowUpRight size={16} /></Link></div>
        <div className="story-number">01<span> / 03</span></div>
      </div>
    </section>
    <section className="feature-band">
      <div className="wrap feature-band-inner">
        <div className="section-kicker">02 / من أول لمسة</div>
        <div className="feature-columns">
          <div className="feature-heading"><h2>وقت الفريق<br />محفوظ بدقة.</h2><p>من الباب إلى التقرير الشهري، كل خطوة بسيطة ومباشرة.</p></div>
          <div className="feature-item"><span className="feature-index">أ</span><Fingerprint size={23} /><h3>بطاقة NFC</h3><p>لمسة سريعة تسجل الدخول أو الخروج من هاتف أندرويد متوافق.</p></div>
          <div className="feature-item"><span className="feature-index">ب</span><CalendarDays size={23} /><h3>سجل مرتب</h3><p>اعرف من حضر، متى وصل، وكم دقيقة تأخر عن بداية ورديته.</p></div>
          <div className="feature-item"><span className="feature-index">ج</span><ChartNoAxesColumnIncreasing size={23} /><h3>صورة الشهر</h3><p>ساعات العمل وأيام الحضور والتأخير في تقرير واحد.</p></div>
        </div>
      </div>
    </section>
    <section className="last-call wrap">
      <div><div className="section-kicker">03 / ابدأ على مهل</div><h2>مساحة صغيرة.<br /><span>وضوح كبير.</span></h2></div>
      <div className="last-call-action"><p>ابدأ بإضافة اسم شركتك. بعدها، أضف فريقك بخطوات بسيطة.</p><Link href="/sign-up" className="button button-primary" data-testid="link-final-sign-up">أنشئ حسابك الآن <ArrowUpRight size={17} /></Link></div>
    </section>
    <footer className="landing-footer wrap"><Logo /><span data-testid="status-service">{health.isLoading ? 'نتحقق من جاهزية الخدمة' : statusLabel}</span><Link href="/sign-in" data-testid="link-footer-signin">لديك حساب؟ سجّل الدخول</Link></footer>
  </main>;
}

function HomeRedirect() {
  return <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><Home /></Show></>;
}

function AuthPage({ type }: { type: 'in' | 'up' }) {
  return <main className="auth-page grain" dir="rtl">
    <div className="auth-brand"><Logo /><span>إدارة الدوام على مقاس يومك</span></div>
    <div className="auth-decoration"><div className="auth-orbit" /><div className="auth-stamp"><Clock3 size={27} /><b>وقتك<br />محفوظ</b></div><p>كل وردية تبدأ بوضوح.</p></div>
    <div className="auth-form-wrap">
      {type === 'in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}
      <Link href="/" className="auth-back" data-testid="link-auth-home">العودة إلى دوامي</Link>
    </div>
  </main>;
}

function AuthMissing() {
  return <div className="auth-missing" dir="rtl"><Logo /><h1>تسجيل الدخول غير مهيأ بعد</h1><p>يلزم إعداد مفتاح Clerk لهذا التطبيق قبل بدء جلسة آمنة. الصفحة العامة متاحة، وبياناتك لن تُحفظ محليًا.</p><Link href="/" className="button button-primary" data-testid="link-back-home">العودة للرئيسية</Link></div>;
}

function ClerkCacheSync() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (previous.current !== undefined && previous.current !== id) client.clear();
    previous.current = id;
  }), [addListener, client]);
  return null;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={arSA}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkCacheSync />
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={() => <AuthPage type="in" />} />
        <Route path="/sign-up/*?" component={() => <AuthPage type="up" />} />
        <Route path="/dashboard" component={() => <Protected><CompanyGate><AppShell><Dashboard /></AppShell></CompanyGate></Protected>} />
        <Route path="/employees" component={() => <Protected><CompanyGate><AppShell><Employees /></AppShell></CompanyGate></Protected>} />
        <Route path="/attendance" component={() => <Protected><CompanyGate><AppShell><Attendance /></AppShell></CompanyGate></Protected>} />
        <Route path="/reports" component={() => <Protected><CompanyGate><AppShell><Reports /></AppShell></CompanyGate></Protected>} />
        <Route component={NotFound} />
      </Switch>
    </QueryClientProvider>
  </ClerkProvider>;
}

function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}

function CompanyGate({ children }: { children: ReactNode }) {
  const companyQuery = useGetCompany();
  const create = useCreateCompany();
  if (companyQuery.isLoading) return <div className="gate-loading" dir="rtl"><Logo /><Skeleton className="h-48 w-full max-w-xl" /></div>;
  if (companyQuery.data) return <>{children}</>;
  return <CompanySetup
    error={companyQuery.isError ? 'لم نعثر على مساحة شركة مرتبطة بهذا الحساب. أنشئ مساحة جديدة للبدء.' : ''}
    busy={create.isPending}
    submit={(name) => create.mutate({ data: { name, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey() }),
    })}
    retry={() => companyQuery.refetch()}
    createError={create.isError ? 'لم نتمكن من إنشاء المساحة. تحقق من الاسم وحاول مرة أخرى.' : ''}
  />;
}

function CompanySetup({ error, busy, submit, retry, createError }: { error: string; busy: boolean; submit: (name: string) => void; retry: () => void; createError: string }) {
  const [name, setName] = useState('');
  const onSubmit = (event: FormEvent) => { event.preventDefault(); if (name.trim().length >= 2) submit(name.trim()); };
  return <main className="setup-page" dir="rtl">
    <header className="setup-head"><Logo /><span><ShieldCheck size={16} /> إعداد آمن لمساحة العمل</span></header>
    <section className="setup-card enter">
      <span className="setup-mark"><House size={25} /></span><div className="section-kicker">قبل أن نبدأ / مساحة واحدة</div>
      <h1>وش اسم شركتك؟</h1><p>أنشئ مساحة عملك أولًا. بيانات الشركة تبقى في حسابك ولا نخزنها على هذا الجهاز.</p>
      {error && <div className="inline-warning" data-testid="status-company-not-found">{error} <button type="button" onClick={retry} data-testid="button-retry-company"><RefreshCw size={14} /> إعادة التحقق</button></div>}
      <form onSubmit={onSubmit} className="setup-form">
        <label htmlFor="company-name">اسم الشركة أو المحل</label>
        <input id="company-name" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={120} required placeholder="مثال: مخبز رغيف" data-testid="input-company-name" />
        {createError && <p className="form-error" data-testid="status-company-error">{createError}</p>}
        <Button disabled={busy || name.trim().length < 2} className="button-primary" data-testid="button-create-company">{busy ? 'جارٍ إنشاء المساحة…' : 'إنشاء مساحة العمل'} <ArrowUpRight size={16} /></Button>
      </form><small className="setup-footnote"><ShieldCheck size={14} /> لا يتم حفظ بيانات الشركة في التخزين المحلي.</small>
    </section>
  </main>;
}

const navItems = [
  { href: '/dashboard', label: 'نظرة عامة', icon: House },
  { href: '/employees', label: 'العمال', icon: Users },
  { href: '/attendance', label: 'الحضور', icon: Fingerprint },
  { href: '/reports', label: 'التقارير', icon: ChartNoAxesColumnIncreasing },
];

function AppShell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const company = useGetCompany();
  const userResult = useUser();
  const { signOut } = useClerk();
  const initial = userResult.user?.firstName?.slice(0, 1) || 'ص';
  const current = navItems.find(item => item.href === path);
  return <div className="app-layout" dir="rtl">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><Logo inverted /><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="إغلاق القائمة" data-testid="button-close-menu"><X size={18} /></button></div>
      <div className="workspace-switch"><span className="workspace-symbol">{company.data?.name?.slice(0, 1) || 'د'}</span><span><b>{company.data?.name || 'مساحة العمل'}</b><small>مساحة الشركة</small></span><ChevronDown size={15} /></div>
      <div className="sidebar-label">القائمة الرئيسية</div>
      <nav className="side-nav">{navItems.map(item => {
        const Icon = item.icon;
        return <Link href={item.href} key={item.href} onClick={() => setMobileOpen(false)} className={`side-link ${path === item.href ? 'active' : ''}`} data-testid={`link-nav-${item.href.slice(1)}`}><Icon size={19} /><span>{item.label}</span>{path === item.href && <i />}</Link>;
      })}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-tip"><span className="tip-glyph"><Fingerprint size={17} /></span><b>الحضور أسهل بلمسة</b><p>جهّز بطاقة NFC لكل عامل من صفحة الحضور.</p><Link href="/attendance" data-testid="link-tip-attendance">إعداد البطاقات <ArrowUpRight size={13} /></Link></div>
        <button className="profile-button" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out"><span className="profile-avatar">{initial}</span><span className="profile-meta"><b>{userResult.user?.firstName || 'صاحب العمل'}</b><small>تسجيل الخروج</small></span><LogOut size={16} /></button>
      </div>
    </aside>
    {mobileOpen && <button className="mobile-scrim" aria-label="إغلاق القائمة" onClick={() => setMobileOpen(false)} data-testid="button-close-scrim" />}
    <div className="main-column">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="فتح القائمة" data-testid="button-open-menu"><Menu size={20} /></button>
        <div className="breadcrumbs"><span>دوامي</span><span>/</span><b>{current?.label || 'مساحة العمل'}</b></div>
        <div className="topbar-right"><span className="today-chip"><CalendarDays size={15} />{new Intl.DateTimeFormat('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span><span className="topbar-avatar">{initial}</span></div>
      </header>
      <main className="page-body enter">{children}</main>
    </div>
  </div>;
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-title"><div><div className="section-kicker">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="title-action">{action}</div>}</div>;
}

function Dashboard() {
  const summary = useGetDashboardSummary();
  const employees = useListEmployees();
  const todayText = new Intl.DateTimeFormat('ar-SA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  return <section data-testid="page-dashboard">
    <PageTitle eyebrow="اليوم / ملخص سريع" title={`صباح الخير${summary.data?.companyName ? `، ${summary.data.companyName}` : ''}`} description={`${todayText} — كل حركة فريقك أمامك.`} action={<Link href="/attendance" className="button button-primary" data-testid="button-open-attendance"><Fingerprint size={17} /> تسجيل الحضور</Link>} />
    <QueryState loading={summary.isLoading || employees.isLoading} error={summary.isError || employees.isError} retry={() => { summary.refetch(); employees.refetch(); }}>
      {summary.data && <div className="dashboard-content">
        <div className="stat-grid">
          <StatCard label="إجمالي الفريق" value={summary.data.totalEmployees} unit="عامل" icon={<Users size={19} />} tone="forest" foot="في مساحة شركتك" testId="stat-total-employees" />
          <StatCard label="حاضرون اليوم" value={summary.data.presentToday} unit="عامل" icon={<BadgeCheck size={19} />} tone="gold" foot={`من أصل ${summary.data.totalEmployees} عامل`} testId="stat-present-today" />
          <StatCard label="تأخير اليوم" value={summary.data.lateToday} unit="عامل" icon={<Clock3 size={19} />} tone="clay" foot="بعد فترة السماح" testId="stat-late-today" />
          <StatCard label="لم يسجلوا بعد" value={summary.data.absentToday} unit="عامل" icon={<Activity size={19} />} tone="blue" foot="حتى هذه اللحظة" testId="stat-absent-today" />
        </div>
        <div className="dash-lower">
          <section className="panel attendance-panel">
            <div className="panel-heading"><div><div className="section-kicker">سجل الحركة</div><h2>آخر الحركات</h2></div><Link href="/attendance" className="subtle-link" data-testid="link-view-attendance">سجل اليوم <ArrowUpRight size={14} /></Link></div>
            {summary.data.recentAttendance.length === 0 ? <EmptyState title="ما فيه حركات مسجلة بعد" body="أول ما يسجل أحد حضوره، بتظهر الحركة هنا." icon={<Fingerprint size={22} />} action={<Link href="/attendance" className="text-link" data-testid="link-empty-attendance">افتح تسجيل الحضور <ArrowUpRight size={15} /></Link>} /> : <div className="activity-list">
              {summary.data.recentAttendance.map(record => <AttendanceLine key={record.id} record={record} />)}
            </div>}
          </section>
          <aside className="panel month-panel">
            <div className="month-panel-top"><span className="month-icon"><Clock3 size={18} /></span><span className="month-label">هذا الشهر</span></div>
            <div className="month-hours" data-testid="stat-month-hours">{summary.data.hoursThisMonth}<small> ساعة</small></div>
            <p>إجمالي وقت العمل المسجل</p>
            <div className="month-divider" />
            <div className="month-late"><span>دقائق التأخير</span><b data-testid="stat-month-late">{summary.data.lateMinutesThisMonth} <small>دقيقة</small></b></div>
            <Link href="/reports" className="month-link" data-testid="link-month-report">تفاصيل التقرير الشهري <ArrowUpRight size={15} /></Link>
          </aside>
        </div>
        <div className="dashboard-footer-note"><span className="note-dot" /> الأرقام تتحدث مع كل حركة حضور وانصراف.</div>
      </div>}
    </QueryState>
  </section>;
}

function StatCard({ label, value, unit, icon, tone, foot, testId }: { label: string; value: number; unit: string; icon: ReactNode; tone: string; foot: string; testId: string }) {
  return <article className={`stat-card tone-${tone}`} data-testid={testId}><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value}<small>{unit}</small></div><div className="stat-foot">{foot}</div></article>;
}

function EmptyState({ title, body, icon, action }: { title: string; body: string; icon: ReactNode; action?: ReactNode }) {
  return <div className="empty-state" data-testid="state-empty"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function AttendanceLine({ record }: { record: { id: number; employeeName: string; checkInAt: string | null; checkOutAt: string | null; lateMinutes: number; status: string } }) {
  const first = record.employeeName.trim().slice(0, 1);
  const time = record.checkOutAt || record.checkInAt;
  return <div className="activity-row" data-testid={`row-attendance-${record.id}`}><span className="avatar avatar-sage">{first}</span><span className="activity-person"><b>{record.employeeName}</b><small>{record.status === 'in-progress' ? 'داخل الوردية' : record.status === 'late' ? `تأخر ${record.lateMinutes} دقيقة` : 'حضور مكتمل'}</small></span><span className="activity-time">{time ? new Intl.DateTimeFormat('ar-SA', { hour: '2-digit', minute: '2-digit' }).format(new Date(time)) : '—'}</span></div>;
}

function Employees() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<Employee | null>(null);
  const [formError, setFormError] = useState('');
  const params = useMemo(() => ({ search: search.trim() || undefined }), [search]);
  const list = useListEmployees(params);
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const deactivate = useDeleteEmployee();
  const employeeRows = list.data || [];
  const refresh = () => list.refetch();
  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
  ]);
  const save = (data: EmployeeInput | EmployeeUpdate) => {
    setFormError('');
    if (editing) update.mutate({ employeeId: editing.id, data: data as EmployeeUpdate }, { onSuccess: () => { void invalidate(); setEditing(null); } , onError: () => setFormError('تعذر حفظ التعديلات. حاول مرة أخرى.') });
    else create.mutate({ data: data as EmployeeInput }, { onSuccess: () => { void invalidate(); setAdding(false); }, onError: () => setFormError('تعذر إضافة العامل. تحقق من البيانات.') });
  };
  const deactivateEmployee = (employee: Employee) => deactivate.mutate({ employeeId: employee.id }, { onSuccess: () => { void invalidate(); setConfirming(null); }, onError: () => setFormError('تعذر تعطيل العامل. حاول مرة أخرى.') });
  return <section data-testid="page-employees">
    <PageTitle eyebrow="فريقك / العمال" title="عمالك، بترتيب" description="أضف الفريق وحدد بداية الوردية وفترة السماح لكل عامل." action={<Button onClick={() => { setFormError(''); setAdding(true); }} className="button-primary" data-testid="button-add-employee"><Plus size={17} /> إضافة عامل</Button>} />
    <div className="list-toolbar"><div className="search-box"><Search size={17} /><input type="search" placeholder="ابحث باسم العامل أو المسمى" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-employees" /><kbd>بحث</kbd></div><span className="count-label" data-testid="text-employee-count">{list.data ? `${employeeRows.length} عامل` : '—'}</span></div>
    <QueryState loading={list.isLoading} error={list.isError} retry={refresh}>
      {employeeRows.length === 0 ? <div className="panel empty-panel"><EmptyState icon={<Users size={22} />} title={search ? 'ما لقينا عامل بهذا الاسم' : 'ابدأ بإضافة أول عامل'} body={search ? 'جرب كلمة ثانية أو امسح البحث.' : 'بيانات بسيطة تكفي عشان تتابع الوردية والحضور.'} action={!search ? <Button onClick={() => setAdding(true)} className="button-primary" data-testid="button-add-first-employee"><Plus size={16} /> إضافة أول عامل</Button> : undefined} /></div> :
        <div className="panel employee-panel">
          <div className="employee-table-head"><span>العامل</span><span>بداية الوردية</span><span>فترة السماح</span><span>الحالة</span><span>إجراءات</span></div>
          {employeeRows.map(employee => <div className={`employee-row ${employee.isActive ? '' : 'inactive-row'}`} key={employee.id} data-testid={`row-employee-${employee.id}`}>
            <div className="employee-identity"><span className={`avatar employee-avatar avatar-${['sage','gold','rose','blue'][employee.id % 4]}`}>{employee.fullName.slice(0, 1)}</span><span><b>{employee.fullName}</b><small>{employee.position || employee.phone || 'بدون مسمى وظيفي'}</small></span></div>
            <span className="mono-cell">{employee.shiftStartTime}</span><span className="grace-cell">{employee.gracePeriodMinutes} دقيقة</span><span><span className={`status-badge ${employee.isActive ? 'status-active' : 'status-inactive'}`} data-testid={`status-employee-${employee.id}`}><i />{employee.isActive ? 'نشط' : 'معطل'}</span></span>
            <div className="row-actions"><button onClick={() => { setEditing(employee); setFormError(''); }} aria-label={`تعديل ${employee.fullName}`} data-testid={`button-edit-employee-${employee.id}`}>تعديل</button>{employee.isActive && <button className="danger-action" onClick={() => { setConfirming(employee); setFormError(''); }} data-testid={`button-deactivate-employee-${employee.id}`}>تعطيل</button>}</div>
          </div>)}
        </div>}
    </QueryState>
    {(adding || editing) && <EmployeeDialog employee={editing} busy={create.isPending || update.isPending} error={formError} close={() => { setAdding(false); setEditing(null); }} save={save} />}
    {confirming && <ConfirmDialog employee={confirming} busy={deactivate.isPending} error={formError} close={() => setConfirming(null)} confirm={() => deactivateEmployee(confirming)} />}
  </section>;
}

function ConfirmDialog({ employee, busy, error, close, confirm }: { employee: Employee; busy: boolean; error: string; close: () => void; confirm: () => void }) {
  return <Modal title="تعطيل العامل؟" close={close} testId="dialog-confirm-deactivate">
    <p className="confirm-copy">سيتم تعطيل <b>{employee.fullName}</b> مع الاحتفاظ بسجلات حضوره السابقة.</p>
    {error && <p className="form-error" data-testid="status-deactivate-error">{error}</p>}
    <div className="dialog-actions"><Button onClick={close} className="button-secondary" data-testid="button-cancel-deactivate">إبقاء العامل</Button><Button onClick={confirm} disabled={busy} className="button-danger" data-testid="button-confirm-deactivate">{busy ? 'جارٍ التعطيل…' : 'تعطيل العامل'}</Button></div>
  </Modal>;
}

type NdefRecordLike = { recordType: string; data: string | ArrayBuffer | DataView | null };
type NdefReaderLike = {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  write: (message: { records: { recordType: string; data: string }[] }) => Promise<void>;
  addEventListener: (type: string, listener: (event: Event & { message: { records: NdefRecordLike[] } }) => void) => void;
};
type NdefWindow = Window & { NDEFReader?: new () => NdefReaderLike };

function Attendance() {
  const employeesQuery = useListEmployees();
  const params = useMemo(() => ({ from: todayISO(), to: todayISO() }), []);
  const attendance = useListAttendance(params);
  const tokenMutation = useCreateEmployeeNfcToken();
  const tapMutation = useTapNfcAttendance();
  const [employeeId, setEmployeeId] = useState('');
  const [nfcState, setNfcState] = useState<'idle' | 'unsupported' | 'writing' | 'scanning' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [tokenReady, setTokenReady] = useState(false);
  const pendingToken = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const supported = typeof window !== 'undefined' && 'NDEFReader' in window;
  useEffect(() => () => abortRef.current?.abort(), []);
  const activeEmployees = (employeesQuery.data || []).filter(employee => employee.isActive);
  const selected = activeEmployees.find(item => String(item.id) === employeeId);
  const createToken = async () => {
    if (!supported) { setNfcState('unsupported'); setMessage('هذا الجهاز أو المتصفح لا يدعم Web NFC. استخدم Chrome على هاتف أندرويد متوافق.'); return; }
    if (!selected) { setNfcState('error'); setMessage('اختر عاملًا أولًا لتهيئة بطاقته.'); return; }
    try {
      setNfcState('writing'); setMessage('جارٍ تجهيز البطاقة للكتابة.');
      const result = await tokenMutation.mutateAsync({ employeeId: selected.id });
      pendingToken.current = result.token;
      setTokenReady(true);
      setNfcState('idle'); setMessage('تم تجهيز عملية آمنة. قرّب بطاقة NFC بعد الضغط على زر الكتابة.');
    } catch { pendingToken.current = null; setTokenReady(false); setNfcState('error'); setMessage('تعذر تجهيز البطاقة. حاول مرة أخرى.'); }
  };
  const writeToken = async () => {
    if (!supported || !pendingToken.current) { setNfcState('unsupported'); setMessage('أعد تهيئة البطاقة من جهاز يدعم Web NFC.'); return; }
    try {
      setNfcState('writing'); setMessage('قرّب البطاقة من ظهر الهاتف لإتمام الكتابة.');
      const Reader = (window as NdefWindow).NDEFReader!;
      const writer = new Reader();
      await writer.write({ records: [{ recordType: 'text', data: pendingToken.current }] });
      pendingToken.current = null;
       setTokenReady(false);
      setNfcState('success'); setMessage(`اكتملت تهيئة بطاقة ${selected?.fullName || 'العامل'}. لم يتم عرض رمز البطاقة.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() }),
      ]);
    } catch {
      pendingToken.current = null; setTokenReady(false); setNfcState('error'); setMessage('لم تكتمل الكتابة. أبقِ الشاشة مفتوحة وقرّب البطاقة من الهاتف مجددًا.');
    }
  };
  const scanAttendance = async () => {
    if (!supported) { setNfcState('unsupported'); setMessage('قراءة NFC غير مدعومة هنا. يلزم HTTPS ومتصفح Chrome على هاتف أندرويد متوافق.'); return; }
    const controller = new AbortController();
    try {
      const Reader = (window as NdefWindow).NDEFReader!;
      const reader = new Reader();
      abortRef.current?.abort();
      abortRef.current = controller;
      let processing = false;
      setNfcState('scanning'); setMessage('قرّب بطاقة العامل من ظهر الهاتف.');
      reader.addEventListener('reading', async event => {
        if (processing) return;
        const record = event.message.records.find(item => item.recordType === 'text');
        if (!record?.data) { controller.abort(); setNfcState('error'); setMessage('لم نجد بيانات حضور صالحة على هذه البطاقة.'); return; }
        processing = true;
        try {
          const token = typeof record.data === 'string' ? record.data : new TextDecoder().decode(record.data instanceof DataView ? record.data.buffer : record.data);
          const result = await tapMutation.mutateAsync({ data: { token } });
          abortRef.current?.abort();
          abortRef.current = null;
          setNfcState('success');
          const action = result.action === 'check-in' ? 'تم تسجيل الحضور' : 'تم تسجيل الانصراف';
          setMessage(`${action} لـ ${result.employeeName} — ${new Intl.DateTimeFormat('ar-SA', { hour: '2-digit', minute: '2-digit' }).format(new Date(result.timestamp))}${result.lateMinutes > 0 ? `، تأخير ${result.lateMinutes} دقيقة` : ''}`);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetMonthlyReportQueryKey() }),
          ]);
          void attendance.refetch();
        } catch {
          abortRef.current?.abort(); abortRef.current = null; setNfcState('error'); setMessage('لم نتعرف على البطاقة أو تعذر تسجيل الحركة. تحقق من البطاقة وحاول مجددًا.');
        }
      });
      await reader.scan({ signal: controller.signal });
    } catch {
      if (controller.signal.aborted) return;
      setNfcState('error'); setMessage('تعذر بدء قراءة NFC. تحقق من أذونات المتصفح وأن الصفحة تعمل عبر HTTPS.');
    }
  };
  const cancelScan = () => { abortRef.current?.abort(); abortRef.current = null; setNfcState('idle'); setMessage('توقفت القراءة.'); };
  const nowDate = new Intl.DateTimeFormat('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return <section data-testid="page-attendance">
    <PageTitle eyebrow="الحضور / تسجيل مباشر" title="لمسة، وانتهى." description={`${nowDate} — سجّل حركة الفريق وتهيئة البطاقات من هاتفك.`} />
    <div className="attendance-layout">
      <section className="panel nfc-panel">
        <div className="nfc-heading"><span className="nfc-rings"><Fingerprint size={31} /></span><div><div className="section-kicker">محطة الحضور</div><h2>سجّل الحضور أو الانصراف</h2><p>استخدم بطاقة العامل على هاتف أندرويد متوافق.</p></div></div>
        <div className="tap-visual"><div className={`tap-ripple ${nfcState === 'scanning' ? 'is-scanning' : ''}`}><Smartphone size={33} /><span><Fingerprint size={22} /></span></div><div><b>{nfcState === 'scanning' ? 'بانتظار البطاقة' : nfcState === 'success' ? 'تم التسجيل' : 'قرّب البطاقة من الهاتف'}</b><small>تأكد من تفعيل NFC في إعدادات الهاتف</small></div></div>
        {message && <div className={`nfc-message ${nfcState === 'error' || nfcState === 'unsupported' ? 'message-error' : nfcState === 'success' ? 'message-success' : ''}`} role="status" data-testid="status-nfc">{message}</div>}
        {nfcState === 'unsupported' && <div className="support-warning" data-testid="status-nfc-unsupported"><CircleAlert size={17} /><span>ميزة NFC تعتمد على اتصال HTTPS ومتصفح أندرويد متوافق مع Web NFC. لا يمكن قراءة UID البطاقة في المتصفح.</span></div>}
        <div className="tap-actions">
          {nfcState === 'scanning' ? <Button onClick={cancelScan} className="button-secondary" data-testid="button-stop-nfc">إيقاف القراءة</Button> : <Button onClick={scanAttendance} disabled={tapMutation.isPending} className="button-primary" data-testid="button-scan-nfc"><Fingerprint size={18} /> بدء قراءة بطاقة</Button>}
          <span className="secure-note"><ShieldCheck size={14} /> لا نعرض رمز البطاقة</span>
        </div>
      </section>
      <section className="panel pairing-panel">
        <div className="panel-heading"><div><div className="section-kicker">إعداد أول مرة</div><h2>تهيئة بطاقة NFC</h2></div><span className="pair-step">خطوتان</span></div>
        <p className="pair-intro">اكتب رمزًا آمنًا على البطاقة لربطها بعامل. الرمز لا يظهر على الشاشة.</p>
        <label className="field-label" htmlFor="nfc-employee">اختر العامل</label>
        <select id="nfc-employee" value={employeeId} onChange={e => { setEmployeeId(e.target.value); pendingToken.current = null; setTokenReady(false); setMessage(''); setNfcState('idle'); }} data-testid="select-nfc-employee">
          <option value="">اختر من الفريق النشط</option>
          {activeEmployees.map(item => <option value={item.id} key={item.id}>{item.fullName}{item.position ? ` — ${item.position}` : ''}</option>)}
        </select>
        {employeesQuery.isLoading ? <Skeleton className="h-16 w-full mt-4" /> : employeesQuery.isError ? <div className="inline-warning">تعذر تحميل قائمة العمال. <button onClick={() => employeesQuery.refetch()} data-testid="button-retry-nfc-employees">إعادة المحاولة</button></div> : activeEmployees.length === 0 ? <div className="inline-empty"><Users size={16} /> أضف عاملًا نشطًا قبل تهيئة بطاقة.</div> : null}
        <div className="pair-steps">
          <div className={`pair-step-row ${tokenReady ? 'step-done' : ''}`}><span>١</span><div><b>جهّز عملية التهيئة</b><small>ينشئ دوامي رمزًا لمرة واحدة.</small></div><Check size={16} /></div>
          <div className={`pair-step-row ${nfcState === 'success' && message.includes('تهيئة') ? 'step-done' : ''}`}><span>٢</span><div><b>اكتب الرمز على البطاقة</b><small>قرّب البطاقة من الهاتف بعد الضغط.</small></div><Check size={16} /></div>
        </div>
        {tokenReady ? <Button onClick={writeToken} disabled={nfcState === 'writing'} className="button-primary full-button" data-testid="button-write-nfc">{nfcState === 'writing' ? 'قرّب البطاقة…' : 'اكتب على بطاقة NFC'} <Fingerprint size={17} /></Button> :
          <Button onClick={createToken} disabled={!selected || tokenMutation.isPending || nfcState === 'writing'} className="button-secondary full-button" data-testid="button-prepare-nfc">{tokenMutation.isPending || nfcState === 'writing' ? 'جارٍ تجهيز البطاقة…' : 'تهيئة بطاقة العامل'} <ArrowUpRight size={16} /></Button>}
        <div className="security-caption"><ShieldCheck size={15} /><span>لا تعتمد العملية على قراءة UID. تتم كتابة نص NDEF على البطاقة فقط.</span></div>
      </section>
    </div>
    <section className="panel today-records">
      <div className="panel-heading"><div><div className="section-kicker">حركات اليوم</div><h2>سجل الحضور</h2></div><span className="count-label">{attendance.data?.length ?? '—'} حركة</span></div>
      <QueryState loading={attendance.isLoading} error={attendance.isError} retry={() => attendance.refetch()}>
        {attendance.data?.length ? <div className="record-list">{attendance.data.map(record => <AttendanceLine key={record.id} record={record} />)}</div> : <EmptyState icon={<CalendarDays size={21} />} title="لا توجد حركات اليوم" body="عند تسجيل أول بطاقة، ستظهر تفاصيلها هنا." />}
      </QueryState>
    </section>
  </section>;
}

function Reports() {
  const [view, setView] = useState<'daily' | 'monthly'>('monthly');
  const [month, setMonth] = useState(currentMonth());
  const [day, setDay] = useState(todayISO());
  const params = useMemo(() => ({ month }), [month]);
  const dayParams = useMemo(() => ({ from: day, to: day }), [day]);
  const report = useGetMonthlyReport(params);
  const daily = useListAttendance(dayParams);
  const downloadCsv = () => {
    if (!report.data) return;
    const lines = [
      ['العامل', 'أيام الحضور', 'أيام التأخير', 'ساعات العمل', 'دقائق التأخير'],
      ...report.data.employees.map(employee => [employee.employeeName, employee.presentDays, employee.lateDays, (employee.workMinutes / 60).toFixed(1), employee.lateMinutes]),
    ];
    const csv = '\uFEFF' + lines.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `dawami-report-${month}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const dailyRows = daily.data || [];
  const dailyWorkMinutes = dailyRows.reduce((sum, row) => sum + row.workMinutes, 0);
  const dailyLateMinutes = dailyRows.reduce((sum, row) => sum + row.lateMinutes, 0);
  const periodLabel = view === 'daily'
    ? new Intl.DateTimeFormat('ar-SA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${day}T12:00:00`))
    : new Intl.DateTimeFormat('ar-SA', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`));
  const currentQuery = view === 'daily' ? daily : report;
  return <section data-testid="page-reports">
    <PageTitle eyebrow="التقارير / صورة العمل" title="الوقت بالأرقام" description="راجع الحضور وساعات العمل والتأخير يوميًا أو خلال الشهر." action={view === 'monthly' ? <Button onClick={downloadCsv} disabled={!report.data} className="button-secondary" data-testid="button-download-report"><Download size={16} /> تنزيل CSV</Button> : undefined} />
    <div className="report-toolbar">
      <div className="report-switch" role="tablist" aria-label="نوع التقرير">
        <Button type="button" role="tab" aria-selected={view === 'daily'} onClick={() => setView('daily')} className={view === 'daily' ? 'button-primary' : 'button-secondary'} data-testid="tab-daily-report">تقرير يومي</Button>
        <Button type="button" role="tab" aria-selected={view === 'monthly'} onClick={() => setView('monthly')} className={view === 'monthly' ? 'button-primary' : 'button-secondary'} data-testid="tab-monthly-report">تقرير شهري</Button>
      </div>
      {view === 'daily' ? <>
        <label htmlFor="report-day"><CalendarDays size={16} /> اليوم</label>
        <input type="date" id="report-day" value={day} onChange={e => setDay(e.target.value || todayISO())} data-testid="input-report-day" />
      </> : <>
        <label htmlFor="report-month"><CalendarDays size={16} /> الشهر</label>
        <input type="month" id="report-month" value={month} onChange={e => setMonth(e.target.value || currentMonth())} data-testid="input-report-month" />
      </>}
      <span className="report-period">{periodLabel}</span>
    </div>
    <QueryState loading={currentQuery.isLoading} error={currentQuery.isError} retry={() => { void currentQuery.refetch(); }}>
      {view === 'daily' ? <div data-testid="daily-report">
        <div className="report-summary-grid daily-summary-grid">
          <div className="report-summary-card primary-summary"><span>ساعات العمل</span><b data-testid="daily-work-hours">{(dailyWorkMinutes / 60).toFixed(1)}<small> ساعة</small></b><div className="summary-ruler"><i /></div></div>
          <div className="report-summary-card"><span>حركات الحضور</span><b data-testid="daily-attendance-count">{dailyRows.length}<small> عامل</small></b><span className="summary-caption">سجلات هذا اليوم</span></div>
          <div className="report-summary-card"><span>دقائق التأخير</span><b data-testid="daily-late-minutes">{dailyLateMinutes}<small> دقيقة</small></b><span className="summary-caption">{dailyRows.filter(row => row.lateMinutes > 0).length} حالة تأخير</span></div>
        </div>
        <section className="panel report-records">
          <div className="panel-heading"><div><div className="section-kicker">السجل التفصيلي</div><h2>دوام الفريق في هذا اليوم</h2></div><span className="count-label">{dailyRows.length} سجل</span></div>
          {dailyRows.length === 0 ? <EmptyState icon={<CalendarDays size={22} />} title="لا توجد سجلات لهذا اليوم" body="اختر يومًا آخر أو سجّل حضور الفريق من صفحة الحضور." action={<Link href="/attendance" className="text-link" data-testid="link-daily-report-attendance">تسجيل الحضور <ArrowUpRight size={15} /></Link>} /> :
            <div className="report-table-wrap"><table className="report-table records-table"><thead><tr><th>العامل</th><th>وقت الدخول</th><th>وقت الانصراف</th><th>الحالة</th><th>ساعات العمل</th><th>دقائق التأخير</th></tr></thead><tbody>{dailyRows.map(record => <tr key={record.id} data-testid={`row-day-record-${record.id}`}><td>{record.employeeName}</td><td>{record.checkInAt ? new Intl.DateTimeFormat('ar-SA', { hour: '2-digit', minute: '2-digit' }).format(new Date(record.checkInAt)) : '—'}</td><td>{record.checkOutAt ? new Intl.DateTimeFormat('ar-SA', { hour: '2-digit', minute: '2-digit' }).format(new Date(record.checkOutAt)) : '—'}</td><td><span className={`status-badge ${record.status === 'late' ? 'status-late' : 'status-active'}`}><i />{record.status === 'late' ? 'متأخر' : record.status === 'in-progress' ? 'داخل الوردية' : 'حاضر'}</span></td><td>{(record.workMinutes / 60).toFixed(1)}</td><td className={record.lateMinutes > 0 ? 'late-text' : ''}>{record.lateMinutes}</td></tr>)}</tbody></table></div>}
        </section>
      </div> : report.data && <>
        <div className="report-summary-grid">
          <div className="report-summary-card primary-summary"><span>إجمالي ساعات العمل</span><b data-testid="report-work-hours">{(report.data.totalWorkMinutes / 60).toFixed(1)}<small> ساعة</small></b><div className="summary-ruler"><i /></div></div>
          <div className="report-summary-card"><span>أيام الحضور</span><b data-testid="report-present-days">{report.data.presentDays}<small> يوم</small></b><span className="summary-caption">على مستوى الفريق</span></div>
          <div className="report-summary-card"><span>أيام التأخير</span><b data-testid="report-late-days">{report.data.lateDays}<small> يوم</small></b><span className="summary-caption">{report.data.totalLateMinutes} دقيقة إجمالًا</span></div>
        </div>
        <section className="panel report-table-panel">
          <div className="panel-heading"><div><div className="section-kicker">تفصيل الفريق</div><h2>ملخص كل عامل</h2></div><span className="count-label" data-testid="text-report-employee-count">{report.data.employees.length} عامل</span></div>
          {report.data.employees.length === 0 ? <EmptyState icon={<ChartNoAxesColumnIncreasing size={22} />} title="ما فيه بيانات لهذا الشهر" body="ستظهر نتائج الفريق بعد تسجيل حركات الحضور." /> :
            <div className="report-table-wrap"><table className="report-table"><thead><tr><th>العامل</th><th>أيام الحضور</th><th>أيام التأخير</th><th>ساعات العمل</th><th>دقائق التأخير</th></tr></thead><tbody>{report.data.employees.map(employee => <tr key={employee.employeeId} data-testid={`row-report-${employee.employeeId}`}><td><span className="report-person"><span className="avatar avatar-sage">{employee.employeeName.slice(0, 1)}</span><b>{employee.employeeName}</b></span></td><td>{employee.presentDays}</td><td><span className={employee.lateDays > 0 ? 'late-text' : ''}>{employee.lateDays}</span></td><td className="mono-cell">{(employee.workMinutes / 60).toFixed(1)} ساعة</td><td>{employee.lateMinutes}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="panel report-records">
          <div className="panel-heading"><div><div className="section-kicker">السجل التفصيلي</div><h2>حركات الشهر</h2></div><span className="count-label">{report.data.records.length} سجل</span></div>
          {report.data.records.length === 0 ? <p className="empty-inline">لا توجد سجلات حضور في هذه الفترة.</p> : <div className="report-table-wrap"><table className="report-table records-table"><thead><tr><th>التاريخ</th><th>العامل</th><th>دخول</th><th>انصراف</th><th>الحالة</th><th>الساعات</th></tr></thead><tbody>{report.data.records.map(record => <tr key={record.id} data-testid={`row-month-record-${record.id}`}><td>{new Intl.DateTimeFormat('ar-SA', { day: 'numeric', month: 'short' }).format(new Date(`${record.attendanceDate}T12:00:00`))}</td><td>{record.employeeName}</td><td>{record.checkInAt ? new Intl.DateTimeFormat('ar-SA', { hour: '2-digit', minute: '2-digit' }).format(new Date(record.checkInAt)) : '—'}</td><td>{record.checkOutAt ? new Intl.DateTimeFormat('ar-SA', { hour: '2-digit', minute: '2-digit' }).format(new Date(record.checkOutAt)) : '—'}</td><td><span className={`status-badge ${record.status === 'late' ? 'status-late' : 'status-active'}`}><i />{record.status === 'late' ? 'متأخر' : record.status === 'in-progress' ? 'داخل الوردية' : 'حاضر'}</span></td><td>{(record.workMinutes / 60).toFixed(1)}</td></tr>)}</tbody></table></div>}
        </section>
      </>}
    </QueryState>
  </section>;
}

function NotFound() {
  return <main className="not-found" dir="rtl"><Logo /><span className="section-kicker">404 / هذه الصفحة غير موجودة</span><h1>ضاع الطريق؟</h1><p>الصفحة المطلوبة غير متاحة. ارجع إلى مساحة عملك.</p><Link href="/dashboard" className="button button-primary" data-testid="link-not-found-dashboard">العودة للوحة التحكم <ArrowUpRight size={16} /></Link></main>;
}

function App() {
  return <WouterRouter base={basePath}>
    {!clerkPubKey ? <QueryClientProvider client={queryClient}><Switch>
      <Route path="/" component={Home} />
      <Route path="/sign-in/*?" component={AuthMissing} />
      <Route path="/sign-up/*?" component={AuthMissing} />
      <Route component={AuthMissing} />
    </Switch></QueryClientProvider> : <ClerkRoutes />}
  </WouterRouter>;
}

export default App;
