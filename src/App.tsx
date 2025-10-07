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
   //Stack,
   Flex,
   Fieldset,
   Switch,
   Modal,
   Container,
   Text,
   //Notification,
   Transition,
   useMantineColorScheme, 
   useComputedColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconSun, IconMoon } from '@tabler/icons-react';
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
   //LS_VIEW,
   UIVIEW
} from '@/types/generalTypes';
import { Submission } from '@/types/checklistTypes';
//import { nowIso } from './services/utils/generalUtils';
import { getInitialSubmission } from './dev/bootstrap';



/*
const initialSubmission: Submission = {
   header: { 
      operator: 'demo', 
      station: 'S1', 
      appVer: '0.1.0', 
      templateVer: '2025-09-19' 
   },
   dut: { 
      prodName: 'MIG 604 CW', 
      brand: 'ELECTREX',
      series: '4',
      serialno: 'N/D', 
      ratedCurrent: 600,
      processes: ['MIG'],
      origin: 'db'
   },
   instruments: { 
      meterId: 'FLUKE-1', 
      meterCal: '2025-01-01', 
      lbId: 'N/D' 
   },
   steps: [],
};
*/






/* |--- COMPONENT ---| */
const App: React.FC  = () => {

   /* |--- STATES ---| */
   // Autenticação e níveis de acesso
   const [showLoginModal, setShowLoginModal] = useState(false); // ------------------------------- Mostra modal de login
   const [isLoggedIn, setIsLoggedIn] = useState(true); // -------------------------------------- Ativa/muda elementos UI após login
   const [authUser, setAuthUser] = useState<CredentialSafe>(); // ------------------------------- Muda acesso a funcionalidades consoante autorização de login
   const [role, setRole] = useState<Role>('admin');//('not_logged');
// const roleRank: Record<Role, number> = { user: 0, admin: 1, superadmin: 2 }; // -------------- Nível de acesso
   const [authBooting, setAuthBooting] = useState(true); // ------------------------------------- Auto-login
   //const [showChangePw, setShowChangePw] = useState(false); // -------------------------------- Comportamento de modal de mudança de password
   const [persistLogin, setPersistLogin] =  // -------------------------------------------------- Mantém user ligado (skip login)
      useState<boolean>(() => {
         return localStorage.getItem(LS_KEEP) === '1';
      });
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
   // Component management & nav
   //const [submission, setSubmission] = useState<Submission>(initialSubmission);
   const [submission, setSubmission] = useState<Submission>(() => getInitialSubmission());
   // UI/UX Basics
   const [navOpened, { toggle: toggleNav }] = useDisclosure();
   const { setColorScheme } = useMantineColorScheme({ keepTransitions: true });
   const computed = useComputedColorScheme('light', { getInitialValueInEffect: true });
   const isDark = computed === 'dark';
   const [uiView, setUiView] = useState<UIVIEW>('basic');
   // DayJS
   const date = dayjs().format('DD/MM/YYYY');





   /* |--- HANDLERS ---| */

   // Login
   const handleLoginSuccess = (user: CredentialSafe) => {
      setAuthUser(user);
      setRole(user.roles)
      setIsLoggedIn(true);
      setShowLoginModal(false);
   };
   const handleLoginClose = () => { setShowLoginModal(false); } // IMPORTANTE - Separei close de open por causa de bugs com a tecla Esc
   //const handlePersistToggle = useCallback((checked: boolean) => { setPersistLogin(checked); }, []); // passar computed canChangePassword 
   const handleLogout = useCallback(() => {
      setAuthUser(undefined);
      setIsLoggedIn(false);
      setPersistLogin(false);
      localStorage.removeItem(LS_KEEP);
      localStorage.removeItem(LS_AUTH);
      setShowLoginModal(true);
      //setShowChangePw(false);
   }, []);




   /* |--- EFFECTS ---| */
   // Manter user logged in
   useEffect(() => { 
      if (persistLogin) {
         localStorage.setItem(LS_KEEP, '1');
      } else {
         localStorage.removeItem(LS_KEEP);
         localStorage.removeItem(LS_AUTH); // dropping stale saved creds
      }
   }, [persistLogin]);
   // Auto-login
   useEffect(() => {
      ( async () => {
         try {
            const keep = localStorage.getItem(LS_KEEP) === '1';
            const raw = localStorage.getItem(LS_AUTH);
            if (keep && raw) {
               // try auto-login
               const { username, password, app } = JSON.parse(raw);
               const { user } = await login(username, password, app || APP_NAME);
               handleLoginSuccess(user);
            } else if (!keep) {
               localStorage.removeItem(LS_AUTH); // ensure no stale creds if flag is off
            }
         } catch {
            localStorage.removeItem(LS_AUTH); // saved creds invalid → drop them
         } finally { setAuthBooting(false); } // UI can render         
      } )();
   }, []);







   /* |--- JSX / RENDER APP ---| */
   return (
      <AppShell 
      layout="alt"
      transitionTimingFunction="ease"
      transitionDuration={500}
      header={{height: 50}}
      navbar={{ 
         width: navOpened&&isLoggedIn ? 320 : 0, 
         breakpoint: 'sm',
         collapsed: {
            mobile: !navOpened&&!isLoggedIn, 
            desktop: !navOpened&&!isLoggedIn
         }
      }}
      footer={{height: 50}}
      bg={'blue.1'}
      >



         <Transition 
         mounted={navOpened} 
         transition={"scale-x"}
         duration={500}
         >
            {(transitionStyle) => (
               <AppShell.Navbar p={navOpened&&isLoggedIn ? "sm" : 0} style={{ ...transitionStyle}} >
                  {navOpened&&isLoggedIn && ( 
                     <Flex 
                     direction={'column'} 
                     w={"100%"} 
                     h={"100%"} 
                     justify={"space-between"} 
                     align={'center'} 
                     p={0} 
                     m={0}>
                        <AdminHUD 
                        submission={submission} 
                        importstyle={transitionStyle} 
                        user={authUser?.nome} />

                        <Button 
                        fullWidth
                        onClick={()=>{ 
                           console.log('toggle adminview'); 
                           setUiView(uiView==='basic'?'advanced':'basic')
                        }}>{uiView==='basic'?'Advanced':'Basic'}</Button>
                     </Flex>
                  )}
               </AppShell.Navbar>
            )}
         </Transition>


         <AppShell.Header>
            { (role!=='not_logged') && 
               <Flex 
               w={"100%"} 
               h={"100%"} 
               justify={"space-between"} 
               align={'center'} 
               px={'xl'} 
               py={0} 
               m={0}>
                  {/* put a role toggle for dev */}
                  <span 
                  style={{ cursor: 'pointer' }} 
                  onClick={
                     (role === 'admin'||'superadmin') 
                     ? toggleNav 
                     : ()=>{}
                  }>Role: <b>{role}</b></span>

               <Button onClick={()=>{
                  handleLogout();
                  setRole('not_logged');
                  !navOpened;
               }}>logout</Button>
            </Flex>}
         </AppShell.Header>


         <AppShell.Main>
            {/* renderComponent() */}
            <Container fluid py="md" mih={"100%"}>
               <ChecklistController
               role={role}
               submission={submission}
               setSubmission={setSubmission}
               // you can pass jumpTo for admin here later
               />
            </Container>

            {!authBooting && showLoginModal && (
               <Modal
               opened={showLoginModal}
               onClose={() => {}}//setShowLoginModal(false)}
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
               <Flex w={"100%"} h={"100%"} justify={"space-between"}>
                  <Fieldset 
                  ml={'xl'} 
                  py={0}  
                  radius="xl" 
                  variant="filled"
                  legend={`Modo ${isDark?'Escuro':'Claro'}`}
                  >
                     <Flex justify="center" p={0} m={0}>
                        <Switch
                        p={0} m={0}
                        checked={isDark}
                        color="dark.4"
                        onLabel={<IconSun size={16} stroke={2.5} color="var(--mantine-color-yellow-4)" />}
                        offLabel={<IconMoon size={16} stroke={2.5} color="var(--mantine-color-blue-6)" />}
                        onChange={()=>{ setColorScheme(isDark ? 'light' : 'dark'); }}
                        />
                     </Flex>
                  </Fieldset>

                  <Flex direction={"column"} justify="center" gap={0} align={"center"} h={"100%"} mr={'xl'} >
                     <Text lh={1} fw={300} p={0} m={0} className='dt'><Clock /></Text>{/*time.format('HH:mm:ss')*/}
                     <Text lh={1} fw={500} p={0} m={0} className='dt'>{date}</Text>{/*<Text mt={'xs'} fw={500}>Nome do utilizador</Text>*/}
                  </Flex>
               </Flex>
            </AppShell.Footer>


      </AppShell>






   )
}

export default App