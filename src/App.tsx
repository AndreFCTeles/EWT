/* |--- IMPORTS ---| */

// Frameworks
import React, {
   useState,
   useEffect,
   useCallback
} from 'react';
import { 
   AppShell,
   Button,
   Flex,
   Switch,
   Modal,
   Container,
   Text,
   Transition,
   useMantineColorScheme, 
   useComputedColorScheme,
   Menu,
   Box,
   Drawer,
   Stepper
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { 
   IconSettings, 
   IconSun, 
   IconMoon,
   IconLogout
} from '@tabler/icons-react';
// Utils
import dayjs from '@/lib/dayjs-setup';
import { APP_NAME } from '@/lib/config';
// Components
import LoginModal from '@/components/login/LoginModal';
import login from '@/components/login/auth';
import { ChecklistController } from '@checklist/ChecklistController';
import { AdminHUD } from '@/components/admin/AdminHUD';
import Clock from '@/components/clock/Clock';
// Types
import { 
   Role,
   CredentialSafe,
   LS_AUTH,
   LS_KEEP,
   UIVIEW
} from '@/types/generalTypes';
import { Submission } from '@/types/checklistTypes';
import { getInitialSubmission } from './dev/bootstrap';
import CalibrationViewer from './components/toolcal/CalibrationViewer';
import { initLoadBankMonitoring } from './services/hw/loadBankRuntimeStore';





/* |--- COMPONENT ---| */
const App: React.FC  = () => {

   /* |--- STATES ---| */
   // Autenticação e níveis de acesso
   const [showLoginModal, setShowLoginModal] = useState(false); // ------------------------------- Mostra modal de login
   const [isLoggedIn, setIsLoggedIn] = useState(true); // -------------------------------------- Ativa/muda elementos UI após login
   const [authUser, setAuthUser] = useState<CredentialSafe>(); // ------------------------------- Muda acesso a funcionalidades consoante autorização de login
   const [role, setRole] = useState<Role>('admin');//('admin');
// const roleRank: Record<Role, number> = { user: 0, admin: 1, superadmin: 2 }; // -------------- Nível de acesso
   const [authBooting, setAuthBooting] = useState(true); // ------------------------------------- Auto-login
   //const [showChangePw, setShowChangePw] = useState(false); // -------------------------------- Comportamento de modal de mudança de password
   const [persistLogin, setPersistLogin] =  // -------------------------------------------------- Mantém user ligado (skip login)
      useState<boolean>(() => {
         return localStorage.getItem(LS_KEEP) === '1';
      });
   // Component management & nav
   const [submission, setSubmission] = useState<Submission>(() => getInitialSubmission());
   // UI/UX Basics
   const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);
   const isAdmin = role === 'admin' || role === 'superadmin';
   const isAuth = isLoggedIn && role !== 'not_logged';
   const canShowNav = isAuth && isAdmin && navOpened;
   const { setColorScheme } = useMantineColorScheme({ keepTransitions: true });
   const computed = useComputedColorScheme('light', { getInitialValueInEffect: true });
   const isDark = computed === 'dark';
   const [uiView, setUiView] = useState<UIVIEW>('basic');
   const [calViewerOpen, setCalViewerOpen] = useState(false);
   const [calViewerToolCode, setCalViewerInstrumentCode] = useState<string | null>(null);
   // Sistema de Notificações
   /*
   const [notification, setNotification] = useState<{
      visible: boolean;
      title: string;
      message: string | React.ReactNode;
      color: string;
   }>({
      visible: false,
      title: '',
      message: '',
      color: 'green',
   });
   const showNotification = useCallback((title: string, message: string | React.ReactNode, color: string) => {
      setNotification({
         visible: true,
         title,
         message,
         color,
      });
      setTimeout(() => { setNotification((prevState) => ({ ...prevState, visible: false })); }, 5000);
   }, []);
   */
   // DayJS
   const date = dayjs().format('DD/MM/YYYY');

   const [active, setActive] = useState(1);
   const nextStep = () => setActive((current) => (current < 3 ? current + 1 : current));
   const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));





   /* |--- HANDLERS ---| */

   // Login
   const handleLoginSuccess = (user: CredentialSafe) => {
      setAuthUser(user);
      setRole(user.roles)
      setIsLoggedIn(true);
      setShowLoginModal(false);
   };
   const handleLoginClose = () => { setShowLoginModal(false); } // IMPORTANTE - Separei close de open por causa de bugs com a tecla Esc
   const handleLogout = useCallback(() => {
      setAuthUser(undefined);
      setIsLoggedIn(false);
      setPersistLogin(false);
      setUiView('basic');
      localStorage.removeItem(LS_KEEP);
      localStorage.removeItem(LS_AUTH);
      setRole('not_logged');
      setShowLoginModal(true);
      closeNav();      
   }, []);


   /* |--- HELPERS ---| */

   //Drawer
   const openViewer = useCallback((code: string) => {
      setCalViewerInstrumentCode(code);
      setCalViewerOpen(true);
   }, []);
   const closeViewer = useCallback(() => setCalViewerOpen(false), []);




   /* |--- EFFECTS ---| */
   // Manter user logged in
   useEffect(() => { 
      if (persistLogin) {
         localStorage.setItem(LS_KEEP, '1');
      } else {
         localStorage.removeItem(LS_KEEP);
         localStorage.removeItem(LS_AUTH); // saved creds inválidas → drop
      }
   }, [persistLogin]);
   // Auto-login
   useEffect(() => {
      ( async () => {
         try {
            const keep = localStorage.getItem(LS_KEEP) === '1';
            const raw = localStorage.getItem(LS_AUTH);
            if (keep && raw) { // try auto-login               
               const { username, password, app } = JSON.parse(raw);
               const { user } = await login(username, password, app || APP_NAME);
               handleLoginSuccess(user);
            } else if (!keep) {
               localStorage.removeItem(LS_AUTH); // stale creds
            }
         } catch {
            localStorage.removeItem(LS_AUTH); // saved creds inválidas → drop
         } finally { setAuthBooting(false); }       
      } )();
   }, []);
   // Estado da conexão banca
   useEffect(() => { initLoadBankMonitoring().catch(console.error); }, []);







   /* |--- JSX / RENDER APP ---| */
   return (
      <AppShell 
      layout="alt"
      transitionTimingFunction="ease"
      transitionDuration={500}
      header={{height: isAdmin?50:0}}
      navbar={{ 
         width: 320,
         breakpoint: 'sm',
         collapsed: {
            mobile: !canShowNav, 
            desktop: !canShowNav
         }
      }}
      footer={{height: 50}}
      bg={'blue.1'}
      >



         <Transition 
         mounted={canShowNav} 
         transition={"scale-x"}
         duration={500}
         >
            {(transitionStyle) => (
               <AppShell.Navbar 
               py={"sm"} 
               px={canShowNav ? "sm" : 0} 
               style={{ ...transitionStyle}} >
                  {canShowNav && ( 
                     <Flex 
                     direction={'column'} 
                     h={"100%"} 
                     justify={"space-between"} 
                     align={'center'} 
                     p={0} 
                     m={0}>
                        <AdminHUD 
                        submission={submission} 
                        importstyle={transitionStyle} 
                        uiView={uiView}
                        user={authUser?.nome} 
                        role={authUser?.roles}
                        onOpenToolCalibration={openViewer}
                        />

                        {/*
                        <Button 
                        fullWidth
                        variant='subtle'
                        mah={"40px"}
                        mih={"40px"}
                        mt={'md'}
                        onClick={()=>{ 
                           console.log('toggle adminview'); 
                           setUiView(uiView==='basic'?'advanced':'basic')
                        }}>{uiView==='basic'?'Advanced':'Basic'}</Button>
                        */}
                     </Flex>
                  )}
               </AppShell.Navbar>
            )}
         </Transition>


         <AppShell.Header>
            { (isAuth && isAdmin) && 
               <Flex 
               w={"100%"} 
               h={isAdmin? "100%" : 0} 
               justify={"left"} 
               align={'center'} 
               pl={'xs'}
               pr={0}
               py={0} 
               m={0}>
                  <Button 
                  variant='subtle'
                  mah={"40px"}
                  mih={"40px"}
                  onClick={ toggleNav }>Painel Admin</Button>
               </Flex>
            }
         </AppShell.Header>


         <AppShell.Main>
            <Container fluid py="md" mih={"100%"} h={100}>
               <ChecklistController
               role={role}
               submission={submission}
               setSubmission={setSubmission}
               />
            </Container>

            {!authBooting && showLoginModal && (
               <Modal
               opened={showLoginModal}
               onClose={() => {}}
               title=""
               centered
               withCloseButton={false}
               closeOnClickOutside={false}
               className='formModal'
               overlayProps={{ 
                  backgroundOpacity: 0.55, 
                  blur: 3 
               }}            
               style={{ 
                  left: "0%", 
                  position: "absolute" 
               }} >
                  <LoginModal 
                  onLoginSuccess={handleLoginSuccess} 
                  onClose={handleLoginClose}
                  />
               </Modal>
            )}
         </AppShell.Main>


         <AppShell.Footer>
            <Flex w={"100%"} h={"100%"} justify={"space-between"} align={"center"} pl={'xs'}>

               <Menu 
               withArrow 
               closeOnItemClick={false} 
               position="bottom-end" 
               shadow="md" 
               >
                  <Menu.Target>
                     <Button 
                     variant="subtle"
                     className='settings'
                     color='red'
                     rightSection={ 
                        <IconSettings size={18} />
                     }>Opções</Button>
                  </Menu.Target>
                  
                  <Menu.Dropdown>
                     <Box
                     px="xs"
                     py={6}
                     onMouseDownCapture={(e) => e.stopPropagation()}
                     onKeyDownCapture={(e) => e.stopPropagation()}
                     >
                        <Switch
                        p={0} m={0}
                        label={`Modo ${isDark?'Escuro':'Claro'}`}
                        labelPosition="left"
                        checked={isDark}
                        color="dark.4"
                        onLabel={<IconSun size={16} stroke={2.5} color="var(--mantine-color-yellow-4)" />}
                        offLabel={<IconMoon size={16} stroke={2.5} color="var(--mantine-color-blue-6)" />}
                        onChange={()=>{ setColorScheme(isDark ? 'light' : 'dark'); }}
                        />
                     </Box>

                     <Menu.Item 
                     color="red"
                     onClick={handleLogout}
                     rightSection={
                        <IconLogout size={16} />
                     }>Terminar sessão</Menu.Item>
                  </Menu.Dropdown>
               </Menu>


               <Flex direction={"column"} justify="center" gap={0} align={"center"} h={"100%"} mr={'xl'} >
                  <Text lh={1} fw={300} p={0} m={0} className='dt'><Clock /></Text>
                  <Text lh={1} fw={500} p={0} m={0} className='dt'>{date}</Text>
               </Flex>
            </Flex>
         </AppShell.Footer>

         <Drawer
         opened={calViewerOpen} 
         onClose={closeViewer} 
         position="right"
         size={"calc(100% - 320px)"}
         withCloseButton
         >
            {calViewerToolCode ? 
               <CalibrationViewer instrumentCode={calViewerToolCode} /> : 
               <Text c="dimmed">Nenhum instrumento.</Text>
            }
         </Drawer>

      </AppShell>
   )
}

export default App