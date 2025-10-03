//Frameworks
import React, { 
   useState, 
   useMemo, 
   memo 
} from 'react'; // FormEvent,
import { 
   TextInput, 
   PasswordInput, 
   Button, 
   Flex,
   Checkbox,
   Center,
   Text
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { 
   CredentialSafe, 
   APP_NAME, 
   LS_LAST, 
   LS_REMEMBER, 
   LS_SAVED,
   LS_AUTH,
   LS_KEEP
} from '@/types/generalTypes';
import login from './auth';


// Props
interface LoginProps {
   onLoginSuccess: (user: CredentialSafe) => void;
   onClose: () => void; 
}







// COMPONENT
const LoginModal: React.FC<LoginProps> = ({onLoginSuccess, onClose}) => {
   // Remember cred
   const initialRemember = useMemo(() => localStorage.getItem(LS_REMEMBER) === '1', []);
   const initialSaved = useMemo(
      () => localStorage.getItem(LS_SAVED) 
            ?? localStorage.getItem(LS_LAST)    
            ?? ''
      , []
   );
   // STATES
   const [serverErr, setServerErr] = useState<string | null>(null);
   const [submitting, setSubmitting] = useState(false);
   const form = useForm({
      initialValues: {
         username: initialRemember ? initialSaved : '',
         password: '',
         remember: initialRemember,
      },
      validate: {
         username: (v) => (v.trim().length >= 3 ? null : 'Nome de utilizador inválido'),
         password: (v) => (v ? null : 'Obrigatório'),
      },
      validateInputOnChange: true,
   });








   // HANDLERS   
   const handleRecover = () => {
      // Stub UX: no public reset endpoint exists yet - TODO mudar isto para RecoverPassword dedicado.
      alert(
         'Sistema de recuperação de credenciais em desenvolvimento.\n\n' 
         +
         'Para recuperar a palavra-passe, contacte o administrador.'
      );
   };







   // SUBMIT
   const onSubmit = form.onSubmit(async ({ username, password, remember }) => {
      setSubmitting(true);
      setServerErr(null);
      try {
         const { user } = await login(username.trim(), password, APP_NAME);

         // Persist UX preferences
         localStorage.setItem(LS_LAST, username.trim());
         localStorage.setItem(LS_REMEMBER, remember ? '1' : '0');
         if (remember) localStorage.setItem(LS_SAVED, username.trim());
         else localStorage.removeItem(LS_SAVED);

         if (localStorage.getItem(LS_KEEP) === '1') {
            localStorage.setItem(
               LS_AUTH,
               JSON.stringify({
                  username: username.trim(),
                  password,        // appPass for this app (plaintext for now)
                  app: APP_NAME,
               })
            );
         }

         onLoginSuccess(user);
         onClose();
      } catch (err: any) {
         const msg = err?.message || 'Credenciais inválidas';
         setServerErr(msg);

         if (/utilizador/i.test(msg)) form.setFieldError('username', 'Nome de utilizador incorreto');
         else if (/password|palavra|credenciais/i.test(msg)) form.setFieldError('password', 'Palavra-passe incorreta');
      } finally {
         setSubmitting(false);
      }
   });









   // JSX
   return (
      <>      
         <form onSubmit={onSubmit}>
            <TextInput
            label="Nome de utilizador"
            placeholder="username"
            mt="md"
            data-autofocus
            required
            {...form.getInputProps('username')}
            />
            <PasswordInput
            label="Password"
            placeholder="password"
            mt="md"
            required
            {...form.getInputProps('password')}  
            />

            <Flex 
            mt="xs" 
            direction="row" 
            justify="space-between" 
            align="center"
            >
               <Checkbox
               label="Lembrar-me"
               {...form.getInputProps('remember', { type: 'checkbox' })}
               />
               <Button variant="transparent" onClick={handleRecover}>
                  Recuperar senha
               </Button>
            </Flex>
            <Text c="red" size="sm">{serverErr ?? ''}</Text>

            <Center>
               <Button 
               type='submit'
               mt='xs'
               loading={submitting} 
               disabled={!form.values.username.trim() || !form.values.password}
               >Login</Button>
            </Center>
         </form>
      </>
   );
};

export default memo(LoginModal);
